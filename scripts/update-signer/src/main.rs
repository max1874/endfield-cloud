use base64::{engine::general_purpose::STANDARD, Engine};
use minisign::{KeyPair, SecretKeyBox};
use std::{env, fs, io::BufReader, path::PathBuf};

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    match args.as_slice() {
        [command] if command == "generate" => {
            let pair = KeyPair::generate_unencrypted_keypair()?;
            eprintln!("{}", STANDARD.encode(pair.pk.to_box()?.to_bytes()));
            println!("{}", STANDARD.encode(pair.sk.to_box(None)?.to_bytes()));
        }
        [command, file] if command == "sign" => {
            // Never include decoding errors or key contents in diagnostics.
            let encoded = env::var("UPDATE_SIGNING_KEY")
                .map_err(|_| "UPDATE_SIGNING_KEY is required")?;
            let bytes = STANDARD.decode(encoded.trim())
                .map_err(|_| "UPDATE_SIGNING_KEY is not valid base64")?;
            let text = String::from_utf8(bytes)
                .map_err(|_| "UPDATE_SIGNING_KEY is not UTF-8")?;
            let key = SecretKeyBox::from_string(&text)
                .and_then(|key| key.into_unencrypted_secret_key())
                .map_err(|_| "UPDATE_SIGNING_KEY is not an unencrypted minisign secret key")?;
            let path = PathBuf::from(file);
            let signature = minisign::sign(None, &key, BufReader::new(fs::File::open(&path)?), None, None)?;
            let mut destination = path.into_os_string();
            destination.push(".sig");
            fs::write(destination, STANDARD.encode(signature.to_bytes()))?;
        }
        _ => return Err("usage: endfield-update-signer generate | sign <file>".into()),
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("update-signer: {error}");
        std::process::exit(1);
    }
}
