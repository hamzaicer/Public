# Free TV

[Free-TV/IPTV](https://github.com/Free-TV/IPTV) ücretsiz kanal listesini tarayıcıda oynatan arayüz.

## Çalıştırma

```bash
npm install
npm run catalog
npm run dev
```

- Ham playlist: `public/playlists/index.m3u8`
- Ülke / grup katalogları: `npm run catalog` ile üretilir
- Resmi kaynak playlist: https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8

## IPTV oynatıcıya bağlama

VLC / IPTV Smarters gibi bir oynatıcıda playlist URL’si olarak şunu kullan:

`https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8`
