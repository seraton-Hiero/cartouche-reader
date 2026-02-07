import { useRef, useState } from "react";

type BBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type SignDetection = {
  bbox: BBox;
  gardiner_id: string | null;
  confidence: number;
  notes?: string;
};

type NameCandidate = {
  name: string;
  confidence: number;
  notes?: string;
};

type AnalysisResult = {
  has_cartouche: boolean;
  cartouche_bbox: BBox | null;
  signs: SignDetection[];
  name_candidates: NameCandidate[];
  transliteration: string | null;
  overall_confidence: number;
  warnings: string[];
};

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  function onSelectFile(f: File) {
    setFile(f);
    setImgUrl(URL.createObjectURL(f));
    setResult(null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);

      const r = await fetch("/.netlify/functions/analyze", {
        method: "POST",
        body: fd,
      });

      if (!r.ok) {
        throw new Error(await r.text());
      }

      const json = await r.json();
      setResult(json);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function renderBBox(b: BBox, color: string, label?: string) {
    const img = imgRef.current;
    if (!img) return null;

    const w = img.clientWidth;
    const h = img.clientHeight;

    return (
      <div
        style={{
          position: "absolute",
          left: b.x * w,
          top: b.y * h,
          width: b.w * w,
          height: b.h * h,
          border: `2px solid ${color}`,
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      >
        {label && (
          <div
            style={{
              background: color,
              color: "#fff",
              fontSize: 12,
              padding: "2px 4px",
              position: "absolute",
              top: -18,
              left: 0,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>Cartouche Reader</h1>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => e.target.files && onSelectFile(e.target.files[0])}
      />

      {imgUrl && (
        <div style={{ marginTop: 16 }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <img
              ref={imgRef}
              src={imgUrl}
              alt="preview"
              style={{ maxWidth: "100%", display: "block" }}
            />

            {result?.cartouche_bbox &&
              renderBBox(result.cartouche_bbox, "red", "Cartucho")}

            {result?.signs.map((s, _i) =>
              renderBBox(
                s.bbox,
                s.gardiner_id ? "lime" : "orange",
                s.gardiner_id
                  ? `${s.gardiner_id} (${Math.round(
                      s.confidence * 100
                    )}%)`
                  : "¿?"
              )
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={analyze} disabled={loading}>
              {loading ? "Analizando…" : "Analizar cartucho"}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          <h2>Resultado</h2>

          <p>
            <strong>Cartucho detectado:</strong>{" "}
            {result.has_cartouche ? "Sí" : "No"}
          </p>

          <p>
            <strong>Confianza global:</strong>{" "}
            {Math.round(result.overall_confidence * 100)}%
          </p>

          {result.transliteration && (
            <p>
              <strong>Transliteración:</strong>{" "}
              {result.transliteration}
            </p>
          )}

          {result.name_candidates.length > 0 && (
            <>
              <h3>Candidatos</h3>
              <ul>
                {result.name_candidates.map((c, _i) => (
                  <li key={_i}>
                    {c.name} — {Math.round(c.confidence * 100)}%
                  </li>
                ))}
              </ul>
            </>
          )}

          {result.warnings.length > 0 && (
            <>
              <h3>Advertencias</h3>
              <ul>
                {result.warnings.map((w, _i) => (
                  <li key={_i}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
