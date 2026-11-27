//! Embedded text extraction from uploaded PDF files.

use std::{error::Error, io::Write};

use tempfile::NamedTempFile;

use crate::domain::document::uploaded_document_input::UploadedDocumentInput;

/// Attempts to extract embedded text from a PDF. Returns [`None`] if no text is found.
///
/// Logs only the file name and the text length: document text can contain personal data.
pub fn get_text_from_pdf(
    uploaded_document_input: &UploadedDocumentInput,
) -> Result<Option<String>, Box<dyn Error>> {
    let mut tmp = NamedTempFile::new()?;
    tmp.write_all(&uploaded_document_input.file_data)?;
    tmp.flush()?;

    let text = pdf_extract::extract_text(tmp.path())?;
    let file_name = uploaded_document_input.file_name.as_deref().unwrap_or("");

    if text.trim().is_empty() {
        tracing::info!("No text extracted from PDF: {}", file_name);
        Ok(None)
    } else {
        tracing::info!(
            "Extracted text from PDF: {}, length: {}",
            file_name,
            text.len()
        );
        Ok(Some(text))
    }
}
