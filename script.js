/* ==========================================================================
   TikTok Video Downloader — front-end interaction layer
   --------------------------------------------------------------------------
   CARA MENYAMBUNGKAN KE API ASLI
   Halaman ini TIDAK berisi data video contoh/dummy. Semua data (akun,
   caption, thumbnail, likes, comments, shares, link unduhan) hanya akan
   tampil jika benar-benar dikembalikan oleh backend yang kamu sediakan.

   1. Buat endpoint backend sendiri (Node/PHP/dsb.) yang menerima URL TikTok,
      memanggil resolver TikTok pilihanmu, dan mengembalikan JSON dengan
      bentuk persis seperti ini:

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

   2. Isi CONFIG.API_ENDPOINT di bawah dengan URL endpoint tersebut.
   3. Selesai — fetchVideoData() dan startDownload() di bawah sudah ditulis
      untuk memanggil endpoint itu langsung, tanpa perlu diubah lagi.

   Selama CONFIG.API_ENDPOINT masih kosong, halaman akan dengan jujur
   menampilkan status "API belum terhubung" — bukan data rekaan.
   ========================================================================== */

const CONFIG = {
  // Backend PHP sendiri (proxy ke resolver TikTok). Endpoint ini di-rewrite
  // oleh .htaccess ke api/download.php di server.
  API_ENDPOINT: "/api/download",
};

(function () {
  "use strict";

  /* ---------------------------------------------------------------------
     Utilities
     --------------------------------------------------------------------- */

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function formatCompact(n) {
    return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------------
     API integration
     --------------------------------------------------------------------- */

  class ApiError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  async function fetchVideoData(url) {
    if (!CONFIG.API_ENDPOINT) {
      throw new ApiError(
        "NOT_CONFIGURED",
        "Endpoint API belum dihubungkan. Atur CONFIG.API_ENDPOINT di js/script.js."
      );
    }

    let res;
    try {
      res = await fetch(CONFIG.API_ENDPOINT + "?url=" + encodeURIComponent(url));
    } catch (err) {
      throw new ApiError("NETWORK_ERROR", "Tidak dapat menghubungi server. Periksa koneksi internet.");
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new ApiError("INVALID_RESPONSE", "Respons server tidak valid.");
    }

    if (!res.ok) {
      // Backend PHP mengembalikan { error: "..." } dengan status non-2xx.
      throw new ApiError("REQUEST_FAILED", data.error || ("Server gagal memproses link ini (status " + res.status + ")."));
    }

    const requiredFields = ["author", "caption", "likes", "comments", "shares"];
    const missing = requiredFields.filter((f) => data[f] === undefined || data[f] === null);
    if (missing.length) {
      throw new ApiError("INVALID_RESPONSE", "Respons server tidak lengkap (kurang: " + missing.join(", ") + ").");
    }

    return data;
  }

  async function startDownload(format) {
    if (!CONFIG.API_ENDPOINT) {
      throw new ApiError("NOT_CONFIGURED", "Endpoint API belum dihubungkan.");
    }
    // URL berkas asli diambil dari currentData.downloadUrls[format] (hasil
    // fetchVideoData) oleh pemanggilnya — fungsi ini hanya titik ekstensi
    // jika suatu saat proses unduhan perlu memanggil endpoint tambahan
    // (misalnya untuk mencatat log unduhan di server).
    return true;
  }

  /* ---------------------------------------------------------------------
     Scroll-reveal (IntersectionObserver) — fade / stagger / blur-to-sharp
     --------------------------------------------------------------------- */

  function initRevealObserver() {
    const targets = qsa("[data-reveal], [data-stagger], .step");
    if (!targets.length) return;

    if (prefersReducedMotion) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
    );

    targets.forEach((el) => io.observe(el));
  }

  function initEndingReveal() {
    const lines = qsa("[data-stagger-word]");
    if (!lines.length) return;

    if (prefersReducedMotion) {
      lines.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const index = lines.indexOf(el);
            setTimeout(() => el.classList.add("is-visible"), index * 160);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.4 }
    );
    lines.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------------------------
     Progress rail (desktop) — highlights current section
     --------------------------------------------------------------------- */

  function initRail() {
    const rail = qs("#rail");
    if (!rail) return;
    const dots = qsa(".rail-dot", rail);
    const sectionMap = {
      hero: qs("#hero"),
      preview: qs("#stepPreview"),
      stats: qs("#stepStats"),
      download: qs("#stepDownload"),
      ending: qs("#ending"),
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const key = Object.keys(sectionMap).find((k) => sectionMap[k] === entry.target);
          dots.forEach((d) => d.classList.toggle("is-active", d.dataset.rail === key));
        });
      },
      { threshold: 0.5 }
    );

    Object.values(sectionMap).forEach((el) => el && io.observe(el));
    rail.classList.add("is-visible");
  }

  /* ---------------------------------------------------------------------
     Number counter: 0 → 1 → 10 → 100 → 1K → ... → angka asli dari API
     --------------------------------------------------------------------- */

  function magnitudeSteps(target) {
    const steps = [0, 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000];
    return steps.filter((s) => s < target);
  }

  function animateCounter(el, target, opts) {
    opts = opts || {};
    const totalDuration = opts.duration || 1800;

    if (prefersReducedMotion) {
      el.textContent = formatCompact(target);
      return;
    }

    const checkpoints = magnitudeSteps(target).concat([target]);
    const stepDuration = totalDuration / checkpoints.length;
    let i = 0;

    function nextStep() {
      if (i >= checkpoints.length) {
        el.textContent = formatCompact(target); // berhenti tepat di angka asli dari API
        return;
      }
      const from = i === 0 ? 0 : checkpoints[i - 1];
      const to = checkpoints[i];
      const start = performance.now();

      function tick(now) {
        const p = Math.min(1, (now - start) / stepDuration);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = Math.round(from + (to - from) * eased);
        el.textContent = formatCompact(val);
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          i++;
          nextStep();
        }
      }
      requestAnimationFrame(tick);
    }
    nextStep();
  }

  /* ---------------------------------------------------------------------
     Main flow controller
     --------------------------------------------------------------------- */

  function initFlow() {
    const form = qs("#linkForm");
    const input = qs("#tiktokUrl");
    const submitBtn = qs("#submitBtn");
    const hint = qs("#formHint");
    const flow = qs("#flow");

    const videoCard = qs("#videoCard");
    const videoThumb = qs("#videoThumb");
    const videoScan = qs("#videoScan");
    const videoBadge = qs("#videoBadge");
    const videoAuthor = qs("#videoAuthor");
    const videoCaption = qs("#videoCaption");
    const placeholderThumb = videoThumb.getAttribute("src");

    const detectProgress = qs("#detectProgress span");
    const detectText = qs("#detectText");
    const detectTextDefault = detectText.textContent;

    const statStats = qs("#stepStats");
    const statRows = qsa("#statList .stat-row");
    let statsAnimated = false;

    const downloadOptions = qsa(".download-option");
    const downloadStatus = qs("#downloadStatus");

    let currentData = null;
    let isProcessing = false;

    function isLikelyTikTokUrl(value) {
      return /tiktok\.com\//i.test(value.trim());
    }

    function resetFlowVisuals() {
      videoCard.classList.remove("is-ready");
      videoThumb.classList.remove("is-sharp");
      videoThumb.setAttribute("src", placeholderThumb);
      videoScan.classList.remove("is-active");
      videoBadge.textContent = "Menunggu link";
      videoAuthor.textContent = "—";
      videoCaption.textContent = "Pratinjau akan muncul di sini setelah video terdeteksi.";
      detectProgress.style.width = "0%";
      detectText.textContent = detectTextDefault;
      statRows.forEach((row) => {
        row.querySelector(".stat-value").textContent = "0";
      });
      statsAnimated = false;
      downloadOptions.forEach((btn) => btn.classList.remove("is-downloading", "is-done"));
      downloadStatus.textContent = "";
      flow.dataset.state = "idle";
      currentData = null;
    }

    async function handleDetect(url) {
      if (isProcessing) return;
      isProcessing = true;

      hint.textContent = "Menghubungi server untuk membaca video…";
      hint.classList.remove("is-error", "is-success");
      submitBtn.classList.add("is-loading");
      flow.dataset.state = "detecting";

      videoBadge.textContent = "Menganalisis…";
      videoScan.classList.add("is-active");
      videoCard.classList.add("is-ready");
      detectText.textContent = "Menghubungi server dan membaca metadata video…";
      detectProgress.style.width = "70%";

      try {
        const data = await fetchVideoData(url);
        currentData = data;

        detectProgress.style.width = "100%";
        videoScan.classList.remove("is-active");
        if (data.thumbnailUrl) {
          videoThumb.setAttribute("src", data.thumbnailUrl);
        }
        videoThumb.classList.add("is-sharp");
        videoBadge.textContent = "Video ditemukan";
        videoAuthor.textContent = data.author;
        videoCaption.textContent = data.caption;
        detectText.textContent = "Video berhasil dibaca. Pratinjau, statistik, dan opsi unduhan sudah siap di bawah.";

        hint.textContent = "Video ditemukan — gulir ke bawah untuk melihat detailnya.";
        hint.classList.add("is-success");

        flow.dataset.state = "ready";

        qs("#flow").scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
      } catch (err) {
        currentData = null;
        detectProgress.style.width = "0%";
        videoScan.classList.remove("is-active");
        videoBadge.textContent = "Gagal memuat";
        videoAuthor.textContent = "—";

        const message = err instanceof ApiError ? err.message : "Video tidak dapat dibaca. Coba lagi.";
        videoCaption.textContent = message;
        detectText.textContent = message;

        hint.textContent = message;
        hint.classList.add("is-error");
      } finally {
        submitBtn.classList.remove("is-loading");
        isProcessing = false;
      }
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) {
        hint.textContent = "Tempel link video TikTok terlebih dahulu.";
        hint.classList.add("is-error");
        return;
      }
      if (!isLikelyTikTokUrl(value)) {
        hint.textContent = "Sepertinya itu bukan link TikTok. Contoh: tiktok.com/@akun/video/123";
        hint.classList.add("is-error");
        return;
      }
      resetFlowVisuals();
      handleDetect(value);
    });

    qsa(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        input.value = chip.dataset.example;
        input.focus();
        form.requestSubmit();
      });
    });

    // animate stats once the stats step scrolls into view — hanya jika data asli tersedia
    if (statStats) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !statsAnimated && currentData) {
              statsAnimated = true;
              statRows.forEach((row) => {
                const key = row.dataset.stat;
                const valueEl = row.querySelector(".stat-value");
                animateCounter(valueEl, currentData[key], { duration: 1600 });
              });
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.45 }
      );
      io.observe(statStats);
    }

    // download buttons — hanya aktif jika API mengembalikan tautan unduhan asli
    downloadOptions.forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!currentData) {
          downloadStatus.textContent = "Deteksi video terlebih dahulu sebelum mengunduh.";
          return;
        }
        if (btn.classList.contains("is-downloading")) return;

        const format = btn.dataset.format;
        const fileUrl = currentData.downloadUrls && currentData.downloadUrls[format];

        if (!fileUrl) {
          downloadStatus.textContent = "API belum menyediakan tautan unduhan untuk format ini.";
          return;
        }

        downloadOptions.forEach((b) => b.classList.remove("is-done"));
        btn.classList.add("is-downloading");
        downloadStatus.textContent = "Menyiapkan berkas unduhan…";

        try {
          await startDownload(format);
          window.open(fileUrl, "_blank", "noopener");
          btn.classList.remove("is-downloading");
          btn.classList.add("is-done");
          downloadStatus.textContent = "Tautan unduhan dibuka di tab baru.";
        } catch (err) {
          btn.classList.remove("is-downloading");
          downloadStatus.textContent = err instanceof ApiError ? err.message : "Gagal memulai unduhan.";
        }
      });
    });

    // restart
    const restartBtn = qs("#restartBtn");
    if (restartBtn) {
      restartBtn.addEventListener("click", () => {
        input.value = "";
        resetFlowVisuals();
        hint.textContent = "Tempel link, lalu tekan “Deteksi video” untuk memulai.";
        hint.classList.remove("is-error", "is-success");
        qs("#hero").scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
        input.focus();
      });
    }
  }

  /* ---------------------------------------------------------------------
     Light parallax on the hero batik pattern
     --------------------------------------------------------------------- */

  function initParallax() {
    if (prefersReducedMotion) return;
    const pattern = qs(".hero-pattern");
    if (!pattern) return;
    let ticking = false;

    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = window.scrollY;
          pattern.style.transform = "translateY(" + y * 0.08 + "px)";
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  /* ---------------------------------------------------------------------
     Init
     --------------------------------------------------------------------- */

  document.addEventListener("DOMContentLoaded", () => {
    initRevealObserver();
    initEndingReveal();
    initRail();
    initFlow();
    initParallax();
  });
})();
