use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::application::document::get_extraction_limits_query::ExtractionLimitsView;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        ExtractionLimitsDto::export().unwrap();
    }
}
