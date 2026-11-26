//! `PdfReader` adapter on `lopdf` and `pdf-extract`.

use std::error::Error;

use async_trait::async_trait;
use lopdf::Document as PdfDocument;
use pdf_extract::PlainTextOutput;

use crate::domain::document::pdf_reader::{PdfReader, PdfUnreadable};

type PdfResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

pub struct LopdfPdfReader;

#[async_trait]
impl PdfReader for LopdfPdfReader {
    async fn embedded_text(&self, bytes: Vec<u8>) -> Result<Option<String>, PdfUnreadable> {
        run_blocking("embedded_text", move || get_text_from_pdf(&bytes)).await
    }

    async fn first_pages(
        &self,
        bytes: Vec<u8>,
        max_pages: u32,
    ) -> Result<(Vec<u8>, u32), PdfUnreadable> {
        run_blocking("first_pages", move || keep_first_pages(&bytes, max_pages)).await
    }
}

/// PDF parsing is CPU work and `pdf-extract` can panic on bad input. The
/// blocking pool keeps the async workers free, and the `JoinError` catches the panic.
async fn run_blocking<T, F>(operation: &'static str, work: F) -> Result<T, PdfUnreadable>
where
    T: Send + 'static,
    F: FnOnce() -> PdfResult<T> + Send + 'static,
{
    match tokio::task::spawn_blocking(work).await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(err)) => {
            tracing::warn!("Cannot read PDF in {operation}: {err}");
            Err(PdfUnreadable)
        }
        Err(join_error) => {
            tracing::warn!("PDF reader failed in {operation}: {join_error}");
            Err(PdfUnreadable)
        }
    }
}

/// Loads the PDF and refuses an encrypted one: the extract endpoint cannot
/// send its pages or text without the password.
fn load_unencrypted(bytes: &[u8]) -> PdfResult<PdfDocument> {
    let document = PdfDocument::load_mem(bytes)?;
    if document.is_encrypted() {
        return Err("the PDF is encrypted".into());
    }
    Ok(document)
}

/// Returns the embedded text, or `None` when the PDF has no text (a scan).
///
/// Logs only the text length: document text can contain personal data.
fn get_text_from_pdf(bytes: &[u8]) -> PdfResult<Option<String>> {
    let document = load_unencrypted(bytes)?;
    let mut text = String::new();
    pdf_extract::output_doc(&document, &mut PlainTextOutput::new(&mut text))?;
    if text.trim().is_empty() {
        tracing::info!("No embedded text in PDF");
        return Ok(None);
    }
    tracing::info!("Extracted embedded PDF text, length: {}", text.len());
    Ok(Some(text))
}

/// Returns a copy of the PDF with only its first `max_pages` pages, and its page count.
fn keep_first_pages(bytes: &[u8], max_pages: u32) -> PdfResult<(Vec<u8>, u32)> {
    let mut document = load_unencrypted(bytes)?;
    let pages_to_delete: Vec<u32> = document
        .get_pages()
        .keys()
        .copied()
        .filter(|page_number| *page_number > max_pages)
        .collect();
    document.delete_pages(&pages_to_delete);
    document.prune_objects();
    let page_count = u32::try_from(document.get_pages().len())?;
    let mut cut_pdf = Vec::new();
    document.save_to(&mut cut_pdf)?;
    Ok((cut_pdf, page_count))
}

#[cfg(test)]
pub(crate) mod tests {
    use lopdf::{Object, Stream, dictionary};

    use super::*;

    const HELLO_WORLD_PDF: &[u8] = include_bytes!("../../../../../tests/resources/hello_world.pdf");

    /// Builds a PDF with `pages` empty pages and no text, like a scan with no OCR layer.
    pub(crate) fn build_blank_pdf(pages: u32) -> Vec<u8> {
        let mut document = blank_pdf_document(pages);
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).expect("save blank pdf");
        bytes
    }

    fn blank_pdf_document(pages: u32) -> PdfDocument {
        let mut document = PdfDocument::with_version("1.5");
        let pages_id = document.new_object_id();
        let kids: Vec<Object> = (0..pages)
            .map(|_| {
                let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
                document
                    .add_object(dictionary! {
                        "Type" => "Page",
                        "Parent" => pages_id,
                        "Contents" => content_id,
                        "Resources" => dictionary! {},
                        "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
                    })
                    .into()
            })
            .collect();
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => kids,
                "Count" => i64::from(pages),
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        document.trailer.set("Root", catalog_id);
        document
    }

    fn build_encrypted_pdf() -> Vec<u8> {
        let mut document = blank_pdf_document(2);
        let encrypt_id = document.add_object(dictionary! {
            "Filter" => "Standard",
            "V" => 1,
            "R" => 2,
        });
        document.trailer.set("Encrypt", encrypt_id);
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).expect("save encrypted pdf");
        bytes
    }

    fn page_count(bytes: &[u8]) -> usize {
        PdfDocument::load_mem(bytes)
            .expect("load pdf")
            .get_pages()
            .len()
    }

    #[tokio::test]
    async fn given_hello_world_pdf_when_embedded_text_then_returns_text() {
        let text = LopdfPdfReader
            .embedded_text(HELLO_WORLD_PDF.to_vec())
            .await
            .expect("readable")
            .expect("has text");

        assert!(text.to_lowercase().contains("hello"), "text was {text:?}");
    }

    #[tokio::test]
    async fn given_blank_pdf_when_embedded_text_then_none() {
        let text = LopdfPdfReader
            .embedded_text(build_blank_pdf(12))
            .await
            .expect("readable");

        assert_eq!(text, None);
    }

    #[tokio::test]
    async fn given_12_page_pdf_when_first_pages_5_then_5_page_pdf() {
        let (cut_pdf, count) = LopdfPdfReader
            .first_pages(build_blank_pdf(12), 5)
            .await
            .expect("readable");

        assert_eq!(count, 5);
        assert_eq!(page_count(&cut_pdf), 5);
        assert!(cut_pdf.starts_with(b"%PDF-"));
    }

    #[tokio::test]
    async fn given_3_page_pdf_when_first_pages_5_then_all_3_pages() {
        let (cut_pdf, count) = LopdfPdfReader
            .first_pages(build_blank_pdf(3), 5)
            .await
            .expect("readable");

        assert_eq!(count, 3);
        assert_eq!(page_count(&cut_pdf), 3);
    }

    #[tokio::test]
    async fn given_garbage_with_pdf_prefix_when_read_then_unreadable() {
        let garbage = b"%PDF-1.7\nthis is not a pdf body".to_vec();

        assert_eq!(
            LopdfPdfReader.embedded_text(garbage.clone()).await,
            Err(PdfUnreadable)
        );
        assert_eq!(
            LopdfPdfReader.first_pages(garbage, 5).await,
            Err(PdfUnreadable)
        );
    }

    #[tokio::test]
    async fn given_encrypted_pdf_when_read_then_unreadable() {
        let encrypted = build_encrypted_pdf();

        assert_eq!(
            LopdfPdfReader.embedded_text(encrypted.clone()).await,
            Err(PdfUnreadable)
        );
        assert_eq!(
            LopdfPdfReader.first_pages(encrypted, 5).await,
            Err(PdfUnreadable)
        );
    }
}
