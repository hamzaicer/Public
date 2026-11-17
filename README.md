# Beacon

[iptv-org/iptv](https://github.com/iptv-org/iptv) açık yayın koleksiyonunu tarayıcıda keşfetmek için arayüz.

## Çalıştırma

```bash
npm install
npm run refresh   # iptv-org'dan güncel M3U + katalog
npm run dev
```

Üretim:

```bash
npm run build
npm start
```

Kaynak playlist’ler `public/playlists` altında; `npm run sync` iptv-org’dan yeniler.
