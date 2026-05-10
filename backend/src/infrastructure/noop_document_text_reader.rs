use std::error::Error;

use async_trait::async_trait;

use crate::{
    domain::{
        document_text_reader::DocumentTextReader, uploaded_document_input::UploadedDocumentInput,
    },
    infrastructure::document_text_extraction::{get_text_from_pdf, needs_ocr},
};

/// Reader used when `TESSERACT_ENABLED` is false: extracts embedded PDF text locally; returns an
/// error when remote OCR would be required.
#[derive(Clone, Copy, Debug, Default)]
pub struct NoOpDocumentTextReader;

impl NoOpDocumentTextReader {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DocumentTextReader for NoOpDocumentTextReader {
    async fn read_image(
        &self,
        uploaded_document_input: &UploadedDocumentInput,
    ) -> Result<String, Box<dyn Error>> {
        if uploaded_document_input.is_pdf() {
            tracing::info!("File '{}' is a PDF.", uploaded_document_input.file_name);
            match get_text_from_pdf(uploaded_document_input)? {
                Some(text) => {
                    tracing::info!("Extracted text from PDF without OCR.");
                    return Ok(text);
                }
                None => {
                    tracing::info!(
                        "No text extracted from PDF; OCR is disabled for file '{}'.",
                        uploaded_document_input.file_name
                    );
                }
            }
        }

        if !needs_ocr(uploaded_document_input) {
            tracing::info!(
                "File '{}' does not need OCR.",
                uploaded_document_input.file_name
            );
            return Ok(String::new());
        }

        Err("Tesseract OCR is disabled (set TESSERACT_ENABLED=true and run Docker with --profile tesseract).".into())
    }
}

#[cfg(test)]
mod tests {
    use std::{fs::File, io::Read, path::PathBuf};

    use uuid::Uuid;

    use super::*;
    use crate::domain::document_text_reader::DocumentTextReader;

    #[tokio::test]
    async fn pdf_with_text_succeeds() {
        let path = PathBuf::from("tests/resources/hello_world.pdf");
        let mut file = File::open(&path).expect("open pdf");
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).unwrap();
        let input =
            UploadedDocumentInput::new("hello_world.pdf".to_string(), buffer, Uuid::new_v4());
        let reader = NoOpDocumentTextReader::new();
        let text = reader.read_image(&input).await.expect("pdf text");
        assert!(
            text.to_lowercase().contains("hello"),
            "expected hello in extracted text: {text:?}"
        );
    }

    #[tokio::test]
    async fn png_requires_ocr_errors() {
        let input =
            UploadedDocumentInput::new("scan.png".to_string(), vec![0_u8, 1, 2], Uuid::new_v4());
        let reader = NoOpDocumentTextReader::new();
        let err = reader
            .read_image(&input)
            .await
            .expect_err("ocr should be disabled");
        assert!(
            err.to_string().contains("Tesseract OCR is disabled"),
            "{err}"
        );
    }
}
