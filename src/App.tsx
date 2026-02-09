import { useRef, useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

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
    const [user, setUser] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

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

      const raw = await r.text();

      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        const cleaned = String(raw)
          .trim()
          .replace(/^```[a-zA-Z]*\s*\n/, "")
          .replace(/\n```$/, "")
          .trim();

        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        const candidate =
          start !== -1 && end !== -1 && end > start
            ? cleaned.slice(start, end + 1)
            : cleaned;

        json = JSON.parse(candidate);
      }

      const safe: AnalysisResult = {
        has_cartouche: Boolean(json?.has_cartouche),
        cartouche_bbox: json?.cartouche_bbox ?? null,
        signs: Array.isArray(json?.signs) ? json.signs : [],
        name_candidates: Array.isArray(json?.name_candidates)
          ? json.name_candidates
          : [],
        transliteration: json?.transliteration ?? null,
        overall_confidence:
          typeof json?.overall_confidence === "number"
            ? json.overall_confidence
            : 0,
        warnings: Array.isArray(json?.warnings) ? json.warnings : [],
      };

      setResult(safe);
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
{!user && (
  <div style={{ marginBottom: 16 }}>
    <h2>Iniciar sesión</h2>
    <button
      onClick={() =>
        signIn(
          prompt("Email") || "",
          prompt("Contraseña") || ""
        )
      }
    >
      Entrar
    </button>
  </div>
)}

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
                {result.name_candidates.map((c, i) => (
                  <li key={i}>
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
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
