use std::error::Error;
use std::path::PathBuf;
use tesseract_rs::TesseractAPI;

/**
* This value was copied from tesseract's source code <a
* href="https://github.com/cafercangundogdu/tesseract-rs/blob/master/tests/integration_test.rs">integration tests</a>.
* I played around with a few values and got the best results with 3.
*/
const BYTES_PER_PIXEL: u32 = 3;

pub fn get_document_text(image_path: PathBuf) -> Result<String, Box<dyn Error>> {
    let api = TesseractAPI::new();
    let tessdata_dir = get_tessdata_dir();
    api.init(tessdata_dir.to_str().unwrap(), "eng")?;
    let (image_data, width, height) = load_test_image(image_path.to_str().unwrap())?;
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

fn load_test_image(filename: &str) -> Result<(Vec<u8>, u32, u32), Box<dyn Error>> {
    let img = image::open(filename)?.to_rgb8();
    let (width, height) = img.dimensions();
    Ok((img.into_raw(), width, height))
}

fn get_default_tessdata_dir() -> PathBuf {
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

fn get_tessdata_dir() -> PathBuf {
    match std::env::var("TESSDATA_PREFIX") {
        Ok(dir) => {
            let path = PathBuf::from(dir);
            println!("Using TESSDATA_PREFIX directory: {:?}", path);
            path
        }
        Err(_) => {
            let default_dir = get_default_tessdata_dir();
            println!(
                "TESSDATA_PREFIX not set, using default directory: {:?}",
                default_dir
            );
            default_dir
        }
    }
}

#[cfg(test)]
mod tests {

    #[test]
    pub fn test_ocr() {
        use std::path::PathBuf;
        // TODO: Move this image to the test resources directory
        let image_path = PathBuf::from("/home/mikeyjay/Downloads/hello_world.png");
        let result = super::get_document_text(image_path);
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
