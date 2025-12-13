use std::error::Error;
// use std::path::PathBuf;

use reqwest::multipart::{Form, Part};
use serde_json::json;

use crate::domain::document_text_reader::DocumentTextReader;

/**
* This value was copied from tesseract's source code <a
* href="https://github.com/cafercangundogdu/tesseract-rs/blob/master/tests/integration_test.rs">integration tests</a>.
* I played around with a few values and got the best results with 3.
*/
const BYTES_PER_PIXEL: u32 = 3;

#[derive(Clone)]
pub struct TesseractAdapter {}

impl TesseractAdapter {
    pub fn new() -> Self {
        TesseractAdapter {}
    }
}

impl DocumentTextReader for TesseractAdapter {
    async fn read_image(&self, bytes: &[u8]) -> Result<String, Box<dyn Error>> {
        // Build the JSON options exactly like the curl example
        let options = json!({
            "languages": ["eng"]
        })
        .to_string();

        // Build multipart form
        let form = Form::new()
            .part("options", Part::text(options).mime_str("application/json")?)
            .part(
                "file",
                Part::bytes(bytes.to_vec())
                    .file_name("image.jpg") // required by many servers
                    .mime_str("image/jpeg")?,
            );

        let client = reqwest::Client::new();
        tracing::info!("Sending request to Tesseract service...");

        let response = client
            .post("http://tesseract:8884/tesseract") // TODO: Make URL configurable
            .multipart(form)
            .send()
            .await;
        let response = match response {
            Ok(resp) => resp,
            Err(e) => {
                tracing::error!("Error sending request to Tesseract service: {}", e);
                return Err(Box::new(e));
            }
        };

        let status = response.status();
        tracing::info!("Tesseract response status: {}", status);
        let body = response.text().await;

        match body {
            Ok(b) => {
                tracing::info!("Tesseract response body received: {}", b);
                Ok(b)
            }
            Err(e) => {
                tracing::error!("Error reading response body: {}", e);
                Err(Box::new(e))
            }
        }

        // let (image_data, width, height) = self.bytes_to_image(bytes)?;
        // let bytes_per_line = width * BYTES_PER_PIXEL;
        // self.api.set_image(
        //     &image_data,
        //     width.try_into()?,
        //     height.try_into()?,
        //     BYTES_PER_PIXEL.try_into()?,
        //     bytes_per_line.try_into()?,
        // )?;
        // let text = self.api.get_utf8_text()?;
        // Ok(text)
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::document_text_reader::DocumentTextReader;

    // #[test]
    // pub fn test_ocr() {
    //     use std::path::PathBuf;
    //     // TODO: Move this image to the test resources directory
    //     let image_path = PathBuf::from("/home/mikeyjay/Downloads/hello_world.png");
    //     let adapter = super::TesseractAdapter::new();
    //     let result = adapter.get_document_text(image_path);
    //     match result {
    //         Ok(text) => {
    //             println!("OCR Result: {}", text);
    //             assert!(
    //                 text.to_lowercase()
    //                     .contains(&String::from("Hello World").to_lowercase())
    //             );
    //         }
    //         Err(e) => {
    //             panic!("OCR failed with error: {}", e);
    //         }
    //     }
    // }

    #[tokio::test]
    pub async fn test_read_image() {
        use std::fs::File;
        use std::io::Read;
        use std::path::PathBuf;

        // TODO: Move this image to the test resources directory
        let path = PathBuf::from("/home/mikeyjay/Downloads/hello_world.png");
        let mut file = File::open(path).expect("Failed to open the file");
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .expect("Failed to read the file");
        let adapter = super::TesseractAdapter::new();
        let result = adapter.read_image(&buffer).await;
        match result {
            Ok(text) => {
                println!("OCR Result: {}", text);
                assert!(
                    text.to_lowercase()
                        .contains(&String::from("Hello World").to_lowercase())
                );
            }
            Err(e) => {
                panic!("OCR failed with error: {}", e);
            }
        }
    }
}
