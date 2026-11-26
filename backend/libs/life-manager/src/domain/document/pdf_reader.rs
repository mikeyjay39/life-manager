use async_trait::async_trait;

/// The PDF is damaged, encrypted, or the reader failed on it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PdfUnreadable;

/// Port to read PDFs. It keeps the PDF libraries out of the application layer.
#[async_trait]
pub trait PdfReader: Send + Sync {
    /// Returns `Ok(None)` when the PDF has no embedded text.
    async fn embedded_text(&self, bytes: Vec<u8>) -> Result<Option<String>, PdfUnreadable>;

    /// Returns a PDF with only the first `max_pages` pages, and the page count of the result.
    async fn first_pages(
        &self,
        bytes: Vec<u8>,
        max_pages: u32,
    ) -> Result<(Vec<u8>, u32), PdfUnreadable>;
}

#[cfg(test)]
pub(crate) mod tests {
    use std::sync::Mutex;

    use super::*;

    /// `PdfReader` with configured results. It records the `max_pages`
    /// values that `first_pages` gets.
    pub(crate) struct FakePdfReader {
        embedded_text: Result<Option<String>, PdfUnreadable>,
        first_pages: Result<(Vec<u8>, u32), PdfUnreadable>,
        first_pages_calls: Mutex<Vec<u32>>,
    }

    impl FakePdfReader {
        pub(crate) fn with_text(text: &str) -> Self {
            Self::new(Ok(Some(text.to_string())), Err(PdfUnreadable))
        }

        pub(crate) fn scanned(cut_pdf: Vec<u8>, page_count: u32) -> Self {
            Self::new(Ok(None), Ok((cut_pdf, page_count)))
        }

        pub(crate) fn unreadable() -> Self {
            Self::new(Err(PdfUnreadable), Err(PdfUnreadable))
        }

        fn new(
            embedded_text: Result<Option<String>, PdfUnreadable>,
            first_pages: Result<(Vec<u8>, u32), PdfUnreadable>,
        ) -> Self {
            Self {
                embedded_text,
                first_pages,
                first_pages_calls: Mutex::new(Vec::new()),
            }
        }

        pub(crate) fn first_pages_calls(&self) -> Vec<u32> {
            self.first_pages_calls.lock().expect("calls lock").clone()
        }
    }

    #[async_trait]
    impl PdfReader for FakePdfReader {
        async fn embedded_text(&self, _bytes: Vec<u8>) -> Result<Option<String>, PdfUnreadable> {
            self.embedded_text.clone()
        }

        async fn first_pages(
            &self,
            _bytes: Vec<u8>,
            max_pages: u32,
        ) -> Result<(Vec<u8>, u32), PdfUnreadable> {
            self.first_pages_calls
                .lock()
                .expect("calls lock")
                .push(max_pages);
            self.first_pages.clone()
        }
    }
}
