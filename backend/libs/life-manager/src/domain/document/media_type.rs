/// File types that the extract endpoint accepts. The type comes from the
/// file's magic number, not from the file name or the client's content type.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExtractionMediaType {
    Png,
    Jpeg,
    Webp,
    Heic,
    Heif,
    Pdf,
}

const PNG_SIGNATURE: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const JPEG_SIGNATURE: &[u8] = &[0xFF, 0xD8, 0xFF];
const PDF_SIGNATURE: &[u8] = b"%PDF-";
const HEIC_BRANDS: [&[u8]; 6] = [b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis"];
const HEIF_BRANDS: [&[u8]; 2] = [b"mif1", b"msf1"];

impl ExtractionMediaType {
    pub fn mime_type(&self) -> &'static str {
        match self {
            ExtractionMediaType::Png => "image/png",
            ExtractionMediaType::Jpeg => "image/jpeg",
            ExtractionMediaType::Webp => "image/webp",
            ExtractionMediaType::Heic => "image/heic",
            ExtractionMediaType::Heif => "image/heif",
            ExtractionMediaType::Pdf => "application/pdf",
        }
    }

    /// Returns `None` when the bytes do not start with a known signature.
    pub fn detect(bytes: &[u8]) -> Option<Self> {
        if bytes.starts_with(PNG_SIGNATURE) {
            return Some(ExtractionMediaType::Png);
        }
        if bytes.starts_with(JPEG_SIGNATURE) {
            return Some(ExtractionMediaType::Jpeg);
        }
        if bytes.starts_with(PDF_SIGNATURE) {
            return Some(ExtractionMediaType::Pdf);
        }
        if bytes.get(0..4) == Some(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            return Some(ExtractionMediaType::Webp);
        }
        detect_iso_bmff(bytes)
    }
}

/// HEIC and HEIF use the ISO base media file format: an `ftyp` box at byte 4
/// with the major brand at bytes 8..12.
fn detect_iso_bmff(bytes: &[u8]) -> Option<ExtractionMediaType> {
    if bytes.get(4..8) != Some(b"ftyp") {
        return None;
    }
    let brand = bytes.get(8..12)?;
    if HEIC_BRANDS.contains(&brand) {
        return Some(ExtractionMediaType::Heic);
    }
    if HEIF_BRANDS.contains(&brand) {
        return Some(ExtractionMediaType::Heif);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn iso_bmff(brand: &[u8; 4]) -> Vec<u8> {
        let mut bytes = vec![0x00, 0x00, 0x00, 0x18];
        bytes.extend_from_slice(b"ftyp");
        bytes.extend_from_slice(brand);
        bytes.extend_from_slice(&[0u8; 8]);
        bytes
    }

    #[test]
    fn given_png_signature_when_detect_then_png() {
        let bytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00];
        assert_eq!(
            ExtractionMediaType::detect(&bytes),
            Some(ExtractionMediaType::Png)
        );
    }

    #[test]
    fn given_jpeg_signature_when_detect_then_jpeg() {
        let bytes = [0xFF, 0xD8, 0xFF, 0xE0, 0x00];
        assert_eq!(
            ExtractionMediaType::detect(&bytes),
            Some(ExtractionMediaType::Jpeg)
        );
    }

    #[test]
    fn given_webp_signature_when_detect_then_webp() {
        let bytes = b"RIFF\x24\x00\x00\x00WEBPVP8 ";
        assert_eq!(
            ExtractionMediaType::detect(bytes),
            Some(ExtractionMediaType::Webp)
        );
    }

    #[test]
    fn given_pdf_signature_when_detect_then_pdf() {
        assert_eq!(
            ExtractionMediaType::detect(b"%PDF-1.7\n"),
            Some(ExtractionMediaType::Pdf)
        );
    }

    #[test]
    fn given_heic_brands_when_detect_then_heic() {
        for brand in [b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis"] {
            assert_eq!(
                ExtractionMediaType::detect(&iso_bmff(brand)),
                Some(ExtractionMediaType::Heic)
            );
        }
    }

    #[test]
    fn given_heif_brands_when_detect_then_heif() {
        for brand in [b"mif1", b"msf1"] {
            assert_eq!(
                ExtractionMediaType::detect(&iso_bmff(brand)),
                Some(ExtractionMediaType::Heif)
            );
        }
    }

    #[test]
    fn given_other_iso_bmff_brand_when_detect_then_none() {
        assert_eq!(ExtractionMediaType::detect(&iso_bmff(b"mp42")), None);
    }

    #[test]
    fn given_short_input_when_detect_then_none() {
        assert_eq!(ExtractionMediaType::detect(&[0xFF, 0xD8]), None);
        assert_eq!(ExtractionMediaType::detect(b"RIFF"), None);
        assert_eq!(ExtractionMediaType::detect(&[]), None);
    }

    #[test]
    fn given_text_bytes_when_detect_then_none() {
        assert_eq!(
            ExtractionMediaType::detect(b"hello, this is a text file\n"),
            None
        );
    }

    #[test]
    fn given_each_type_when_mime_type_then_expected_value() {
        assert_eq!(ExtractionMediaType::Png.mime_type(), "image/png");
        assert_eq!(ExtractionMediaType::Jpeg.mime_type(), "image/jpeg");
        assert_eq!(ExtractionMediaType::Webp.mime_type(), "image/webp");
        assert_eq!(ExtractionMediaType::Heic.mime_type(), "image/heic");
        assert_eq!(ExtractionMediaType::Heif.mime_type(), "image/heif");
        assert_eq!(ExtractionMediaType::Pdf.mime_type(), "application/pdf");
    }
}
