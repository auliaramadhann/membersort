# Member Credits - Core Brief

## 1. Ringkasan Produk

Member Credits adalah tool untuk streamer dan VTuber yang ingin menampilkan
daftar member YouTube sebagai end-credit scene yang personal, santai, dan
mudah digunakan di OBS.

Produk ini bukan sekadar ticker member baru. Fokusnya adalah membuat momen
apresiasi yang terasa seperti credit roll setelah stream selesai.

## 2. Visi

Streamer dapat membuat end-credit scene yang indah tanpa harus memahami CSS,
Browser Source, atau automation yang rumit.

Target pengalaman akhir:

1. Streamer membuka OBS.
2. Streamer memilih atau menyalakan scene ending.
3. Member Credits menampilkan credit roll.
4. Daftar member tersinkron dari YouTube jika akses API tersedia.
5. Streamer dapat mengatur seluruh tampilan langsung dari OBS.

## 3. Prinsip Produk

- Personal, hangat, dan tidak terasa seperti dashboard enterprise.
- Santai dan kasual, tetapi tetap terbaca saat ditampilkan di stream.
- Preview harus mencerminkan hasil akhir di OBS.
- Tidak ada animasi tersembunyi atau autoplay yang mengejutkan pengguna.
- Konfigurasi harus mudah dipahami tanpa dokumentasi panjang.
- Data member harus diperlakukan sebagai data sensitif dan tidak diekspos
  melalui URL publik tanpa alasan yang jelas.
- Stabilkan perilaku dan desain sebelum mengerjakan OAuth atau plugin native.

## 4. Visual Direction

### Main Website / Editor

Gaya utama adalah creative workspace yang ringan, bukan SaaS dashboard.

- Background putih hangat atau paper-like.
- Palet lembut: ivory, sage, butter yellow, dusty blue.
- Font utama casual dan rounded.
- `Nunito` cocok untuk teks UI dan daftar member.
- `Kalam` dapat digunakan untuk heading atau aksen tulisan tangan.
- Gunakan rounded cards, border tipis, dan shadow lembut.
- Hindari terlalu banyak uppercase label, font mono, dan hero marketing besar.

### Credits Overlay

- Fokus pada keterbacaan dan rasa apresiasi.
- Background dapat solid atau transparan.
- Warna title/accent, nama member, dan footer dapat diatur terpisah.
- Font, ukuran, tier, footer, dan kecepatan dapat dikonfigurasi.
- Mode tampilan mendukung credit roll dan bottom ticker.
- Text alignment mendukung left, center/middle, dan right.
- Bottom ticker menampilkan seluruh nama member tanpa header tier.
- Animasi harus terasa tenang, tidak terburu-buru.

## 5. MVP Web Saat Ini

MVP web adalah tahap validasi desain dan perilaku sebelum OAuth.

### Sudah tersedia

- Editor title dan closing message.
- Editor tier dan daftar member manual.
- Font size slider.
- Roll speed slider.
- Pilihan font.
- Accent color.
- Member text color.
- Footer text color.
- Background color.
- Toggle transparent background.
- Live preview.
- Preview controls: Play, Pause, Stop.
- URL overlay yang dapat digunakan sebagai OBS Browser Source.
- Prettier, TypeScript, dan production build.

### Data MVP

Untuk sementara daftar member menggunakan data manual atau dummy. Belum ada:

- Google OAuth.
- YouTube API.
- Database.
- Sinkronisasi otomatis.
- Akun pengguna.
- Preset cloud.

## 6. Perilaku Credits yang Disepakati

### Live Preview

- Preview langsung terlihat ketika halaman dibuka.
- Preview tidak bergerak sebelum tombol Play ditekan.
- Play menjalankan rolling credits.
- Pause menghentikan animasi pada posisi terakhir.
- Stop menghentikan animasi dan mengembalikan credits ke awal.
- Perubahan font size, font, warna, dan background terlihat di preview.
- Awal animasi menampilkan layar kosong, kemudian title masuk dari bawah
  dengan cepat namun tidak terlalu mendadak.
- Setelah title masuk, credits bergerak ke atas secara konsisten.

### Overlay OBS untuk Testing

- Untuk fase testing saat ini, overlay boleh autoplay ketika URL dibuka.
- Background transparan harus benar-benar transparan pada Browser Source OBS.
- Checkerboard hanya boleh tampil di dashboard sebagai indikator transparansi,
  bukan di output OBS.
- Jika OBS menampilkan asset lama, Browser Source dapat di-refresh manual.

### Target Trigger Scene

Setelah perilaku dasar stabil, overlay tidak lagi autoplay saat dibuka biasa.
Target workflow:

1. Browser Source berada di scene ending.
2. Source tidak aktif ketika scene lain digunakan.
3. Saat scene ending aktif, credits mulai dari awal.
4. Saat scene ending selesai, credits berhenti atau source tidak terlihat.

Untuk versi Browser Source, pendekatan awal yang digunakan adalah pengaturan OBS:

- `Shutdown source when not visible`.
- `Refresh browser source when scene becomes active`.

Versi native nantinya harus menangani trigger ini secara langsung melalui
lifecycle source dan visibility scene.

## 7. Acceptance Criteria MVP Web

MVP web dianggap stabil jika:

- Preview tidak blank ketika pertama kali dibuka.
- Play, Pause, dan Stop bekerja konsisten.
- Stop selalu mengembalikan credits ke posisi awal.
- Font size slider memengaruhi preview dan overlay.
- Roll speed memengaruhi preview dan overlay.
- Mode transparan tidak menghasilkan warna background di OBS.
- Mode background color menghasilkan warna yang dipilih.
- Title tidak menunggu terlalu lama sebelum masuk ke layar.
- URL overlay dapat dibuka ulang tanpa konfigurasi rusak.
- Layout editor tetap usable di desktop dan mobile.
- `npm run build` berhasil.
- `npm run format:check` berhasil.

## 8. Tahap Berikutnya: Validasi YouTube

Sebelum membuat backend besar, lakukan proof of concept API.

### Tujuan

Memastikan channel YouTube nyata dapat mengambil data member yang dibutuhkan.

### Validasi

- Google OAuth untuk pemilik channel.
- Scope YouTube membership yang diperlukan.
- Request `members.list` pada channel yang memenuhi syarat.
- Cek field nama, avatar, tier, dan informasi durasi membership.
- Cek perilaku member yang keluar, berubah tier, atau datanya tidak tersedia.
- Catat quota, error, rate limit, dan batasan akses.

### Keputusan penting

Jangan menjadikan durasi membership, avatar, atau roster lengkap sebagai fitur
utama sebelum data tersebut terbukti tersedia secara konsisten.

## 9. Roadmap Produk

### Phase 0 - Stabilize Web MVP

- Rapikan visual editor.
- Stabilkan preview playback.
- Stabilkan timing dan rolling behavior.
- Uji background transparency di OBS.
- Uji browser source pada scene ending.
- Dokumentasikan konfigurasi OBS.

### Phase 1 - YouTube API Proof of Concept

- Buat Google Cloud project.
- Uji OAuth lokal.
- Uji `members.list` dengan channel nyata.
- Buat adapter data member internal.
- Tampilkan status API dengan jelas jika akses ditolak atau data tidak lengkap.

### Phase 2 - Web MVP Terhubung

- Dashboard login.
- Connect YouTube channel.
- Sync dan cache member.
- Manual refresh.
- Roster member dengan tier.
- Fallback manual import jika API tidak tersedia.
- Overlay URL stabil yang tidak berisi OAuth token.

### Phase 3 - Web Productization

- Preset dan template.
- Multiple overlay configurations.
- Custom CSS atau advanced styling.
- Scheduled sync.
- Authentication dan storage yang aman.
- Deployment dan monitoring.

### Phase 4 - Native OBS Plugin Prototype

- Plugin C++ lintas platform menggunakan `libobs` dan Qt.
- Custom source `Member Credits`.
- Panel properties langsung di OBS.
- Settings tersimpan di scene collection.
- Native Play, Pause, Stop, dan reset.
- Scene visibility sebagai trigger.
- Hotkey untuk start dan stop.
- Data dummy atau cache lokal terlebih dahulu.

### Phase 5 - Native Plugin Production

- Integrasi OAuth dengan browser eksternal atau service pendamping.
- Secure token storage per operating system.
- YouTube sync dan local cache.
- Font loading dan rendering yang konsisten.
- Windows, macOS, dan Linux builds.
- Code signing, installer, updater, dan crash reporting.
- Dokumentasi instalasi dan troubleshooting.

## 10. Arah Arsitektur Native

Target native bukan sekadar membungkus website. Plugin harus terasa seperti
bagian dari OBS.

Komponen utama:

- `obs_source_info` untuk source Member Credits.
- Qt dock atau properties panel untuk pengaturan.
- `obs_data_t` untuk konfigurasi yang tersimpan di scene collection.
- Custom renderer untuk text, tier, warna, font, dan scrolling.
- Lifecycle source untuk mengetahui visibility dan scene activation.
- Local cache untuk tetap dapat menampilkan roster terakhir saat offline.
- OAuth eksternal karena embedded Google login tidak ideal.

Native plugin tetap tunduk pada batasan YouTube API. Native hanya mengubah
pengalaman penggunaan dan integrasi OBS, bukan menghapus syarat akses API.

## 11. Non-Goals untuk Sekarang

Jangan mengerjakan hal berikut sebelum Phase 0 selesai:

- Native C++ plugin penuh.
- Marketplace template.
- Subscription dan billing.
- Multi-user team workspace.
- Avatar animation yang kompleks.
- Durasi membership sebagai kategori utama.
- Integrasi platform selain YouTube.
- Backend production dengan banyak service.

## 12. Definition of Done Project

Project dianggap mencapai target utama jika streamer dapat:

1. Mengatur credits dengan nyaman.
2. Melihat hasilnya secara real-time.
3. Menjalankan preview dengan kontrol yang jelas.
4. Menggunakan output di OBS tanpa background yang tidak diinginkan.
5. Menyalakan scene ending dan mendapatkan credits dari awal.
6. Menghubungkan channel YouTube ketika API sudah tervalidasi.
7. Menggunakan workflow yang sama melalui native OBS plugin pada tahap akhir.
