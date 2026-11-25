// Legge il testo delle immagini con Vision di macOS (gratis, offline).
// Uso: ocr <immagine>…  → una riga JSON per immagine:
//   {"f": percorso, "r": [{"t": testo, "c": fiducia, "x","y","w","h": riquadro 0–1, origine in alto a sinistra,
//                          "e": [{"x","y","w","h", "vx","vy","vw","vh"}]}]}
// "e": le «E» isolate della riga, con la posizione della parola che le segue (v…). Vision non vede
// l'accento staccato della È maiuscola dei trailer («MARGARET QUALLEY È SENSAZIONALE»):
// lo script guarda i pixel sopra la E e li confronta con quelli sopra la lettera vicina.
import AppKit
import Foundation
import Vision

func riquadro(_ b: CGRect) -> [String: Double] {
  return ["x": Double(b.minX), "y": Double(1 - b.maxY), "w": Double(b.width), "h": Double(b.height)]
}

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
      var riga: [String: Any] = riquadro(o.boundingBox)
      riga["t"] = c.string
      riga["c"] = c.confidence
      // Le E isolate: "E" con uno spazio (o l'inizio) prima e uno spazio dopo.
      var ee: [[String: Double]] = []
      let s = c.string
      var i = s.startIndex
      while i < s.endIndex {
        let dopo = s.index(after: i)
        let primaOk = i == s.startIndex || " \"“«'".contains(s[s.index(before: i)])
        if s[i] == "E", primaOk, dopo < s.endIndex, s[dopo] == " " {
          let lettera = s.index(after: dopo)
          if lettera < s.endIndex,
             let be = try? c.boundingBox(for: i..<dopo)?.boundingBox,
             let bv = try? c.boundingBox(for: lettera..<s.index(after: lettera))?.boundingBox {
            var e = riquadro(be)
            let v = riquadro(bv)
            e["vx"] = v["x"]; e["vy"] = v["y"]; e["vw"] = v["w"]; e["vh"] = v["h"]
            ee.append(e)
          }
        }
        i = dopo
      }
      if !ee.isEmpty { riga["e"] = ee }
      righe.append(riga)
    }
  }
  let d = try! JSONSerialization.data(withJSONObject: ["f": path, "r": righe])
  print(String(data: d, encoding: .utf8)!)
}
