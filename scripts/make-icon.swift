// Masks square artwork to the macOS app icon grid: an 824 px rounded tile centred
// on a 1024 px canvas with a soft shadow. Usage: swift make-icon.swift in.png out.png
import AppKit

let args = CommandLine.arguments
guard args.count == 3, let source = NSImage(contentsOfFile: args[1]),
      let art = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage: make-icon.swift in.png out.png\n".data(using: .utf8)!)
    exit(1)
}
let canvas: CGFloat = 1024, tileSize: CGFloat = 824, radius: CGFloat = 185
let tile = CGRect(x: (canvas - tileSize) / 2, y: (canvas - tileSize) / 2, width: tileSize, height: tileSize)
let ctx = CGContext(data: nil, width: Int(canvas), height: Int(canvas), bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .high
let shape = CGPath(roundedRect: tile, cornerWidth: radius, cornerHeight: radius, transform: nil)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 24, color: CGColor(gray: 0, alpha: 0.3))
ctx.addPath(shape)
ctx.setFillColor(CGColor(gray: 1, alpha: 1))
ctx.fillPath()
ctx.restoreGState()
ctx.addPath(shape)
ctx.clip()
ctx.draw(art, in: tile)
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
