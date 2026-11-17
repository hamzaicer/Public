# Beacon

[iptv-org/iptv](https://github.com/iptv-org/iptv) açık yayınları + [iptv-org/epg](https://github.com/iptv-org/epg) program rehberi.

## Çalıştırma

```bash
npm install
npm run refresh   # M3U + katalog + EPG indeksi
npm run dev
```

Üretim:

```bash
npm run build
npm start
```

### EPG güncelleme

```bash
git clone --depth 1 https://github.com/iptv-org/epg.git ../epg
cd ../epg && npm install
npm run grab --- --sites=tvplus.com.tr,digiturk.com.tr,dsmart.com.tr,turksatkablo.com.tr --days=2 --maxConnections=5 --output=../Public/public/epg/tr.xml --json=../Public/public/epg/tr.json
cd ../Public && npm run epg:index
```

Playlist’ler `public/playlists`, EPG `public/epg` altında.
