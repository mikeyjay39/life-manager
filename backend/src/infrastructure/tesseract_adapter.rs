use std::error::Error;
use std::path::PathBuf;
use tesseract_rs::TesseractAPI;

use crate::domain::document_text_reader::DocumentTextReader;

/**
* This value was copied from tesseract's source code <a
* href="https://github.com/cafercangundogdu/tesseract-rs/blob/master/tests/integration_test.rs">integration tests</a>.
* I played around with a few values and got the best results with 3.
*/
const BYTES_PER_PIXEL: u32 = 3;

#[derive()]
pub struct TesseractAdapter {
    api: TesseractAPI,
}

impl TesseractAdapter {
    pub fn new() -> Result<Self, Box<dyn Error>> {
        let adapter = TesseractAdapter {
            api: TesseractAPI::new(),
        };
        let tessdata_dir = adapter.get_tessdata_dir();
        adapter.api.init(tessdata_dir.to_str().unwrap(), "eng")?;
        Ok(adapter)
    }

    pub fn get_document_text(&self, image_path: PathBuf) -> Result<String, Box<dyn Error>> {
        let api = TesseractAPI::new();
        let tessdata_dir = self.get_tessdata_dir();
        api.init(tessdata_dir.to_str().unwrap(), "eng")?;
        let (image_data, width, height) = self.load_test_image(image_path.to_str().unwrap())?;
        let bytes_per_line = width * BYTES_PER_PIXEL;
        api.set_image(
            &image_data,
            width.try_into().unwrap(),
            height.try_into().unwrap(),
            BYTES_PER_PIXEL.try_into().unwrap(),
            bytes_per_line.try_into().unwrap(),
        )?;
        let text = api.get_utf8_text()?;
        Ok(text)
    }

    fn load_test_image(&self, filename: &str) -> Result<(Vec<u8>, u32, u32), Box<dyn Error>> {
        let img = image::open(filename)?.to_rgb8();
        let (width, height) = img.dimensions();
        Ok((img.into_raw(), width, height))
    }

    fn bytes_to_image(&self, bytes: &[u8]) -> Result<(Vec<u8>, u32, u32), Box<dyn Error>> {
        let img = image::load_from_memory(bytes)?.to_rgb8();
        let (width, height) = img.dimensions();
        Ok((img.into_raw(), width, height))
    }

    fn get_default_tessdata_dir(&self) -> PathBuf {
        if cfg!(target_os = "macos") {
            let home_dir = std::env::var("HOME").expect("HOME environment variable not set");
            PathBuf::from(home_dir)
                .join("Library")
                .join("Application Support")
                .join("tesseract-rs")
                .join("tessdata")
        } else if cfg!(target_os = "linux") {
            let home_dir = std::env::var("HOME").expect("HOME environment variable not set");
            PathBuf::from(home_dir)
                .join(".tesseract-rs")
                .join("tessdata")
        } else if cfg!(target_os = "windows") {
            PathBuf::from(std::env::var("APPDATA").expect("APPDATA environment variable not set"))
                .join("tesseract-rs")
                .join("tessdata")
        } else {
            panic!("Unsupported operating system");
        }
    }

    fn get_tessdata_dir(&self) -> PathBuf {
        match std::env::var("TESSDATA_PREFIX") {
            Ok(dir) => {
                let path = PathBuf::from(dir);
                println!("Using TESSDATA_PREFIX directory: {:?}", path);
                path
            }
            Err(_) => {
                let default_dir = self.get_default_tessdata_dir();
                println!(
                    "TESSDATA_PREFIX not set, using default directory: {:?}",
                    default_dir
                );
                default_dir
            }
        }
    }
}

impl DocumentTextReader for TesseractAdapter {
    fn read_image(&self, bytes: &[u8]) -> Result<String, Box<dyn Error>> {
        let (image_data, width, height) = self.bytes_to_image(bytes)?;
        let bytes_per_line = width * BYTES_PER_PIXEL;
        self.api.set_image(
            &image_data,
            width.try_into().unwrap(),
            height.try_into().unwrap(),
            BYTES_PER_PIXEL.try_into().unwrap(),
            bytes_per_line.try_into().unwrap(),
        )?;
        let text = self.api.get_utf8_text()?;
        Ok(text)
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::document_text_reader::DocumentTextReader;

    #[test]
    pub fn test_ocr() {
        use std::path::PathBuf;
        // TODO: Move this image to the test resources directory
        let image_path = PathBuf::from("/home/mikeyjay/Downloads/hello_world.png");
        let adapter = super::TesseractAdapter::new().unwrap();
        let result = adapter.get_document_text(image_path);
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

    #[test]
    pub fn test_read_image() {
        use std::fs::File;
        use std::io::Read;
        use std::path::PathBuf;

        // TODO: Move this image to the test resources directory
        let path = PathBuf::from("/home/mikeyjay/Downloads/hello_world.png");
        let mut file = File::open(path).expect("Failed to open the file");
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .expect("Failed to read the file");
        let adapter = super::TesseractAdapter::new().unwrap();
        let result = adapter.read_image(&buffer);
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
