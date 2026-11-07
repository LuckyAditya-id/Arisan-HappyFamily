# Kocokan Arisan (Netlify)

Struktur:
- public/index.html            -> tampilan aplikasi
- netlify/functions/*.mjs      -> server kecil (Netlify Functions + Netlify Blobs)
- netlify.toml, package.json   -> pengaturan deploy

Deploy: unggah seluruh folder ini ke repo GitHub, lalu di Netlify pilih
Add new site -> Import from Git. Tidak perlu build command.
Reset data: Netlify -> Blobs -> store "arisan" -> hapus key "state".
