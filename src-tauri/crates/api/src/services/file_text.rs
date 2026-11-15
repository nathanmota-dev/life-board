//! Which stored files are plain text (`.txt`, `.md`) and can be edited in the app.

const TEXT_MIMES: [&str; 3] = ["text/plain", "text/markdown", "text/x-markdown"];
/// Storage names keep 8 characters of the extension, so `.markdown` is stored as `.markdow`.
const TEXT_EXTENSIONS: [&str; 3] = ["txt", "md", "markdow"];

/// The sanitized upload name kept after the `<ulid>-` prefix of a storage path.
pub fn original_name(storage_path: &str) -> &str {
    storage_path.split_once('-').map_or(storage_path, |(_, name)| name)
}

/// A `.txt` or `.md` file, by mime type or, when the mime is unknown, by the uploaded name.
pub fn is_text_item(mime: &str, storage_path: &str) -> bool {
    let mime = mime.to_ascii_lowercase();
    if TEXT_MIMES.contains(&mime.as_str()) {
        return true;
    }
    let unknown = mime.is_empty() || mime == "application/octet-stream";
    let extension = original_name(storage_path).rsplit_once('.').map(|(_, ext)| ext.to_ascii_lowercase());
    unknown && extension.is_some_and(|ext| TEXT_EXTENSIONS.contains(&ext.as_str()))
}
