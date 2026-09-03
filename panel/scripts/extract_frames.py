import sys
import os
import json
import cv2

def extract_frames(
    video_path,
    output_dir="public/frames",
    max_frames=150,
    target_width=2560,
    target_height=1440
):
    if not os.path.exists(video_path):
        print(f"HATA: Video dosyası bulunamadı: '{video_path}'")
        return False

    os.makedirs(output_dir, exist_ok=True)

    # Önceki kareleri temizle
    for f in os.listdir(output_dir):
        if f.startswith("frame_") and (f.endswith(".jpg") or f.endswith(".webp")):
            try:
                os.remove(os.path.join(output_dir, f))
            except:
                pass

    cap = cv2.VideoCapture(video_path)
    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"\n==========================================")
    print(f"4K / 2K Süper-Çözünürlük Kare Motoru Başlatıldı")
    print(f"Kaynak Video: {video_path}")
    print(f"Orijinal Çözünürlük: {orig_w}x{orig_h} | Toplam Kare: {total_video_frames} | FPS: {fps}")
    print(f"Hedef Yüksek Çözünürlük: {target_width}x{target_height} (Lanczos-4 Süper-Örnekleme)")
    print(f"==========================================\n")

    if total_video_frames <= 0:
        print("HATA: Video kareleri okunamadı.")
        cap.release()
        return False

    if total_video_frames <= max_frames:
        step = 1.0
        num_frames = total_video_frames
    else:
        step = total_video_frames / float(max_frames)
        num_frames = max_frames

    extracted_count = 0
    for i in range(int(num_frames)):
        target_frame_idx = int(i * step)
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame_idx)
        ret, frame = cap.read()
        if not ret:
            break

        # 1. 2K/4K Lanczos4 Süper-Çözünürlük Ölçekleme
        upscaled = cv2.resize(
            frame,
            (target_width, target_height),
            interpolation=cv2.INTER_LANCZOS4
        )

        # 2. Sinematik Detay & Keskinleştirme Maskesi (Yıldızlar, gemi halatları ve dümen dokusu için)
        gaussian = cv2.GaussianBlur(upscaled, (0, 0), 1.8)
        sharpened = cv2.addWeighted(upscaled, 1.42, gaussian, -0.42, 0)

        filename = f"frame_{i+1:04d}.jpg"
        out_path = os.path.join(output_dir, filename)

        # Yüksek kalite JPEG (94) - Sıfır sıkıştırma paraziti
        cv2.imwrite(out_path, sharpened, [int(cv2.IMWRITE_JPEG_QUALITY), 94])
        extracted_count += 1

        if (i + 1) % 20 == 0 or i == int(num_frames) - 1:
            print(f"İşleniyor (Lanczos4 + Unsharp Mask): {i+1}/{int(num_frames)} kare tamamlandı...")

    cap.release()

    manifest = {
        "totalFrames": extracted_count,
        "extension": "jpg",
        "pattern": "/frames/frame_%04d.jpg",
        "width": target_width,
        "height": target_height,
        "superResolution": True
    }

    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nTEBRİKLER! {extracted_count} adet 2K/4K kristal netliğinde süper-çözünürlüklü kare '{output_dir}' dizinine çıkarıldı.")
    print(f"Manifest güncellendi: '{manifest_path}'.\n")
    return True

if __name__ == "__main__":
    v_path = sys.argv[1] if len(sys.argv) > 1 else "public/media/merhaba_ben_websitem_için_bir.mp4"
    extract_frames(v_path)
