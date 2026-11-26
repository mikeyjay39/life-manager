use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::application::document::get_extraction_limits_query::ExtractionLimitsView;
use crate::domain::document::document_extractor::ExtractedDocumentFields;

#[derive(Serialize, Deserialize, Clone, Debug, TS, PartialEq)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/ExtractionLimitsDto.ts"
)]
pub struct ExtractionLimitsDto {
    pub daily_limit_per_user: u32,
    pub remaining_today: u32,
    // ts-rs maps u64 to bigint; JSON numbers parse as number in the frontend.
    #[ts(type = "number")]
    pub max_file_bytes: u64,
    pub max_pdf_pages: u32,
}

impl ExtractionLimitsDto {
    pub fn from_view(view: &ExtractionLimitsView) -> Self {
        Self {
            daily_limit_per_user: view.limits.daily_limit_per_user,
            remaining_today: view.remaining_today,
            max_file_bytes: view.limits.max_file_bytes,
            max_pdf_pages: view.limits.max_pdf_pages,
        }
    }
}

/// Suggested Document form fields. A field the provider did not find is `null`.
/// Dates are `YYYY-MM-DD` strings.
#[derive(Serialize, Deserialize, Clone, Debug, TS, PartialEq)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/ExtractedDocumentFieldsDto.ts"
)]
pub struct ExtractedDocumentFieldsDto {
    pub title: Option<String>,
    pub content: Option<String>,
    pub tags: Vec<String>,
    pub issued_date: Option<NaiveDate>,
    pub expire_date: Option<NaiveDate>,
}

impl ExtractedDocumentFieldsDto {
    pub fn from_domain(fields: ExtractedDocumentFields) -> Self {
        Self {
            title: fields.title,
            content: fields.content,
            tags: fields.tags,
            issued_date: fields.issued_date,
            expire_date: fields.expire_date,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        ExtractionLimitsDto::export().unwrap();
        ExtractedDocumentFieldsDto::export().unwrap();
    }

    #[test]
    fn given_dates_when_serialize_then_iso_date_strings() {
        let dto = ExtractedDocumentFieldsDto {
            title: None,
            content: None,
            tags: Vec::new(),
            issued_date: NaiveDate::from_ymd_opt(2027, 1, 1),
            expire_date: None,
        };

        let json = serde_json::to_value(&dto).unwrap();

        assert_eq!(json["issued_date"], "2027-01-01");
        assert!(json["expire_date"].is_null());
        assert!(json["title"].is_null());
    }
}
