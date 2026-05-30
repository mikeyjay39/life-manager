//! Shared PDF text extraction and OCR-needed detection for [`DocumentTextReader`] implementations.

use std::{collections::HashSet, error::Error, io::Write};

use once_cell::sync::Lazy;
use tempfile::NamedTempFile;

use crate::domain::uploaded_document_input::UploadedDocumentInput;

static OCR_EXTENSIONS: Lazy<HashSet<&'static str>> =
    Lazy::new(|| HashSet::from(["png", "jpg", "jpeg", "tiff", "bmp", "gif"]));

/// Attempts to extract embedded text from a PDF without OCR. Returns [`None`] if no text is found.
pub fn get_text_from_pdf(
    uploaded_document_input: &UploadedDocumentInput,
) -> Result<Option<String>, Box<dyn Error>> {
    let mut tmp = NamedTempFile::new()?;
    tmp.write_all(&uploaded_document_input.file_data)?;
    tmp.flush()?;

    let text = pdf_extract::extract_text(tmp.path())?;

    if text.trim().is_empty() {
        tracing::info!(
            "No text extracted from PDF. {}",
            uploaded_document_input.file_name
        );
        Ok(None)
    } else {
        tracing::info!(
            "Extracted text from PDF: {}\n, {}",
            uploaded_document_input.file_name,
            text
        );
        Ok(Some(text))
    }
}

/// Whether the upload likely needs remote OCR based on its file extension.
pub fn needs_ocr(uploaded_document_input: &UploadedDocumentInput) -> bool {
    OCR_EXTENSIONS.contains(uploaded_document_input.extension.as_str())
}
