// Legge il testo delle immagini con Vision di macOS (gratis, offline).
// Uso: ocr <immagine>…  → una riga JSON per immagine:
//   {"f": percorso, "r": [{"t": testo, "c": fiducia, "x","y","w","h": riquadro 0–1, origine in alto a sinistra}]}
import AppKit
import Foundation
import Vision

for path in CommandLine.arguments.dropFirst() {
  var righe: [[String: Any]] = []
  if let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["it-IT", "en-US"]
    req.usesLanguageCorrection = true
    try? VNImageRequestHandler(cgImage: cg).perform([req])
    for o in req.results ?? [] {
      guard let c = o.topCandidates(1).first else { continue }
      let b = o.boundingBox
      righe.append(["t": c.string, "c": c.confidence, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height])
    }
  }
  let d = try! JSONSerialization.data(withJSONObject: ["f": path, "r": righe])
  print(String(data: d, encoding: .utf8)!)
}
