# TikTok Video Downloader — Landing Page

Landing page mobile-first untuk alur "tempel link → deteksi → pratinjau →
statistik → unduh", dengan gaya visual clean, bright, premium, dan cinematic.
Latar belakang menggunakan pola batik kawung yang sangat samar (opacity ±5%).

## Struktur folder

```
tiktok-downloader/
├── index.html          Struktur halaman & konten
├── css/
│   └── style.css        Design tokens, layout, komponen, animasi
├── js/
│   └── script.js         Logika interaksi (lihat catatan API di bawah)
├── assets/
│   ├── batik-pattern.svg     Tekstur batik kawung untuk background hero
│   └── preview-placeholder.svg  Sampul video sebelum thumbnail asli dimuat
└── README.md
```

## Cara menjalankan

Buka `index.html` langsung di browser, atau jalankan server statis sederhana
dari dalam folder ini, misalnya:

```bash
python3 -m http.server 8080
```

lalu buka `http://localhost:8080`.

## ⚠️ Tentang data video (penting)

Proyek ini adalah **front-end saja** dan **tidak berisi data video contoh
atau hardcode apa pun** — tidak ada akun, caption, likes, komentar, share,
maupun tautan unduhan palsu di mana pun dalam kode. Semua nilai tersebut
hanya akan tampil jika benar-benar dikembalikan oleh backend yang kamu
sediakan sendiri.

Selama belum dihubungkan ke backend, halaman akan **jujur menampilkan
status "Endpoint API belum dihubungkan"** saat link ditempel — bukan
menampilkan angka atau video rekaan.

### Menyambungkan ke API asli

1. Siapkan backend milikmu sendiri (Node/PHP/dsb.) yang menerima URL
   TikTok, memanggil layanan resolver TikTok pilihanmu, lalu mengembalikan
   JSON dengan bentuk persis:

   ```json
   {
     "author": "@namaakun",
     "caption": "Caption asli video",
     "thumbnailUrl": "https://.../thumbnail.jpg",
     "likes": 12345,
     "comments": 678,
     "shares": 90,
     "downloadUrls": {
       "mp4-hd": "https://.../video-hd.mp4",
       "mp4-sd": "https://.../video-sd.mp4",
       "mp3": "https://.../audio.mp3"
     }
   }
   ```

2. Buka `js/script.js`, isi `CONFIG.API_ENDPOINT` di baris paling atas
   dengan URL endpoint tersebut, misalnya:

   ```js
   const CONFIG = {
     API_ENDPOINT: "https://api.contohmu.com/resolve",
   };
   ```

3. Selesai. `fetchVideoData()` akan langsung memanggil endpoint itu lewat
   `fetch()`, memvalidasi field yang wajib ada (`author`, `caption`,
   `likes`, `comments`, `shares`), lalu mengisi pratinjau, statistik
   (counter angka berhenti tepat di angka dari API), dan tombol unduhan
   memakai `downloadUrls[format]` dari respons tersebut apa adanya.

Jika field yang wajib tidak lengkap, respons gagal, atau endpoint belum
diisi, halaman menampilkan pesan status yang sesuai (bukan data palsu) dan
tombol unduhan tetap nonaktif sampai `downloadUrls` benar-benar tersedia.

## Alur halaman

1. **Hero** — input link TikTok + dua contoh cepat.
2. **Deteksi** — status membaca link, progress bar tipis.
3. **Pratinjau** — kartu video sticky/pinned berisi sampul, akun, caption.
4. **Statistik** — likes, komentar, share dengan animasi hitung naik
   (0 → 1 → 10 → 100 → 1K → … → angka asli), berhenti tepat di angka asli.
5. **Unduh** — tiga pilihan format (MP4 HD, MP4 ringkas, MP3).
6. **Penutup** — "Simple. Fast. Done." dengan tombol untuk mengunduh video lain.

## Interaksi & animasi

- Scroll-reveal halus (fade, slide, blur-to-sharp) lewat `IntersectionObserver`.
- Kartu video pinned/sticky selama bagian statistik & unduhan di-scroll.
- Parallax ringan pada pola batik di hero.
- Counter angka berhenti tepat di data asli (bukan angka hardcode acak).
- Menghormati `prefers-reduced-motion`: animasi dinonaktifkan otomatis
  bila pengguna mengaktifkan pengaturan tersebut di sistemnya.

## Tipografi & warna

- **Plus Jakarta Sans** untuk judul/angka, **Inter** untuk teks isi.
- Latar off-white hangat (`#FAF8F2`), aksen indigo tua ala batik tulis
  (`#24314F`) dan emas pudar (`#A9812E`) — dipakai secukupnya, tanpa neon
  atau efek glow berlebihan.
