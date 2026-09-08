<?php
/**
 * ==========================================================================
 * TikTok Downloader — Backend Proxy (PHP native, tanpa framework)
 * --------------------------------------------------------------------------
 * Endpoint ini dipanggil frontend lewat "/api/download?url=<link_tiktok>"
 * (di-rewrite oleh .htaccess di root ke file ini).
 *
 * Tugasnya:
 *   1. Validasi URL TikTok yang dikirim user.
 *   2. Teruskan (proxy) permintaan ke TikWM API lewat cURL di server side —
 *      jadi URL/nama TikWM TIDAK PERNAH terlihat di JavaScript frontend.
 *   3. Terjemahkan (mapping) field TikWM ke bentuk yang dipakai frontend:
 *      author, caption, thumbnailUrl, likes, comments, shares, downloadUrls.
 *   4. Selalu balas JSON, termasuk saat error, dengan HTTP status yang sesuai.
 * ==========================================================================
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// --------------------------------------------------------------------------
// Konfigurasi
// --------------------------------------------------------------------------

const TIKWM_ENDPOINT   = 'https://www.tikwm.com/api/';
const CURL_TIMEOUT_SEC = 15;

// --------------------------------------------------------------------------
// Helper: kirim respons JSON lalu berhenti
// --------------------------------------------------------------------------

/**
 * @param array<string,mixed> $payload
 */
function respond(int $httpStatus, array $payload): void
{
    http_response_code($httpStatus);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function respondError(int $httpStatus, string $code, string $message): void
{
    respond($httpStatus, [
        'error'   => $message,
        'code'    => $code,
    ]);
}

// --------------------------------------------------------------------------
// 1. Hanya izinkan method GET
// --------------------------------------------------------------------------

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    respondError(405, 'METHOD_NOT_ALLOWED', 'Metode tidak diizinkan. Gunakan GET.');
}

// --------------------------------------------------------------------------
// 2. Ambil & validasi parameter "url"
// --------------------------------------------------------------------------

$videoUrl = trim((string) ($_GET['url'] ?? ''));

if ($videoUrl === '') {
    respondError(400, 'MISSING_URL', 'Parameter "url" wajib diisi.');
}

if (mb_strlen($videoUrl) > 2048) {
    respondError(400, 'URL_TOO_LONG', 'URL yang dikirim terlalu panjang.');
}

if (filter_var($videoUrl, FILTER_VALIDATE_URL) === false) {
    respondError(400, 'INVALID_URL', 'Format URL tidak valid.');
}

// Terima domain TikTok yang umum dipakai, termasuk short link (vt./vm.)
// dan versi mobile (m.tiktok.com).
$isTikTokUrl = (bool) preg_match(
    '#^https?://(www\.|vt\.|vm\.|m\.)?tiktok\.com/#i',
    $videoUrl
);

if (!$isTikTokUrl) {
    respondError(400, 'NOT_TIKTOK_URL', 'URL yang dikirim bukan link TikTok yang valid.');
}

// --------------------------------------------------------------------------
// 3. Panggil TikWM API lewat cURL (server-to-server, tidak kena CORS)
// --------------------------------------------------------------------------

$queryUrl = TIKWM_ENDPOINT . '?' . http_build_query(['url' => $videoUrl]);

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $queryUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 3,
    CURLOPT_CONNECTTIMEOUT => CURL_TIMEOUT_SEC,
    CURLOPT_TIMEOUT        => CURL_TIMEOUT_SEC,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_HTTPHEADER     => [
        'Accept: application/json',
    ],
    // User-Agent browser biasa supaya tidak mudah ditolak oleh TikWM.
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; TikTokDownloaderProxy/1.0)',
]);

$rawResponse = curl_exec($ch);
$curlErrNo   = curl_errno($ch);
$curlErr     = curl_error($ch);
$httpCode    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($curlErrNo !== 0) {
    error_log('[tiktok-downloader] cURL error (' . $curlErrNo . '): ' . $curlErr);
    respondError(502, 'UPSTREAM_UNREACHABLE', 'Tidak dapat menghubungi server resolver. Coba lagi nanti.');
}

if ($httpCode < 200 || $httpCode >= 300) {
    error_log('[tiktok-downloader] Upstream HTTP status: ' . $httpCode);
    respondError(502, 'UPSTREAM_ERROR', 'Server resolver membalas dengan status tidak valid.');
}

if ($rawResponse === false || $rawResponse === '') {
    respondError(502, 'UPSTREAM_EMPTY', 'Server resolver tidak memberikan respons.');
}

// --------------------------------------------------------------------------
// 4. Decode JSON dari upstream
// --------------------------------------------------------------------------

$upstream = json_decode($rawResponse, true);

if (!is_array($upstream)) {
    error_log('[tiktok-downloader] Upstream JSON invalid: ' . substr($rawResponse, 0, 500));
    respondError(502, 'UPSTREAM_INVALID_JSON', 'Respons server resolver tidak dapat dibaca.');
}

$upstreamCode = $upstream['code'] ?? null;
$upstreamData = $upstream['data'] ?? null;

if ($upstreamCode !== 0 || !is_array($upstreamData)) {
    $msg = is_string($upstream['msg'] ?? null) ? $upstream['msg'] : 'Video tidak ditemukan atau link tidak valid.';
    respondError(422, 'RESOLVE_FAILED', $msg);
}

// --------------------------------------------------------------------------
// 5. Mapping field upstream -> bentuk yang dibutuhkan frontend
// --------------------------------------------------------------------------

$authorInfo = is_array($upstreamData['author'] ?? null) ? $upstreamData['author'] : [];

$authorHandle = null;
if (!empty($authorInfo['unique_id'])) {
    $authorHandle = '@' . $authorInfo['unique_id'];
} elseif (!empty($authorInfo['nickname'])) {
    $authorHandle = $authorInfo['nickname'];
}

$hdUrl = $upstreamData['hdplay'] ?? null;
$sdUrl = $upstreamData['play'] ?? null;
$mp3Url = $upstreamData['music'] ?? null;

$result = [
    'author'       => $authorHandle,
    'caption'      => $upstreamData['title'] ?? null,
    'thumbnailUrl' => $upstreamData['cover'] ?? null,
    'likes'        => isset($upstreamData['digg_count']) ? (int) $upstreamData['digg_count'] : null,
    'comments'     => isset($upstreamData['comment_count']) ? (int) $upstreamData['comment_count'] : null,
    'shares'       => isset($upstreamData['share_count']) ? (int) $upstreamData['share_count'] : null,
    'downloadUrls' => [
        'mp4-hd' => $hdUrl ?: $sdUrl,
        'mp4-sd' => $sdUrl,
        'mp3'    => $mp3Url,
    ],
];

// --------------------------------------------------------------------------
// 6. Validasi akhir: pastikan field wajib sudah terisi sebelum dikirim
// --------------------------------------------------------------------------

$requiredFields = ['author', 'caption', 'likes', 'comments', 'shares'];
$missing = [];
foreach ($requiredFields as $field) {
    if ($result[$field] === null) {
        $missing[] = $field;
    }
}

if (!empty($missing)) {
    error_log('[tiktok-downloader] Field kurang dari upstream: ' . implode(', ', $missing));
    respondError(502, 'INCOMPLETE_UPSTREAM_DATA', 'Data dari resolver tidak lengkap (kurang: ' . implode(', ', $missing) . ').');
}

respond(200, $result);
