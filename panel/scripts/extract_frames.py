import sys
import os
import json
import cv2
import numpy as np

def extract_frames(
    video_path,
    output_dir="public/frames",
    max_frames=160,
    target_width=3840,
    target_height=2160
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

    print(f"\n=======================================================")
    print(f"[4K ULTRA-HD CRYSTAL NETLIK KARE MOTORU BASLATILDI]")
    print(f"Kaynak Video: {video_path}")
    print(f"Orijinal Cozunurluk: {orig_w}x{orig_h} | Toplam Kare: {total_video_frames} | FPS: {fps}")
    print(f"Hedef Cozunurluk: {target_width}x{target_height} (True 4K UHD + Lanczos-4 + CLAHE + Unsharp Mask)")
    print(f"=======================================================\n")

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

    clahe = cv2.createCLAHE(clipLimit=1.75, tileGridSize=(8, 8))

    extracted_count = 0
    for i in range(int(num_frames)):
        target_frame_idx = int(i * step)
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame_idx)
        ret, frame = cap.read()
        if not ret:
            break

        # 1. 4K Ultra-HD Lanczos-4 Süper-Örnekleme
        up4k = cv2.resize(
            frame,
            (target_width, target_height),
            interpolation=cv2.INTER_LANCZOS4
        )

        # 2. LAB Uzayında CLAHE Kontrast İyileştirme (Gökyüzü zifiri siyah, yıldızlar elmas gibi parlak)
        lab = cv2.cvtColor(up4k, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        cl = clahe.apply(l)
        enhanced = cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR)

        # 3. Sinematik Unsharp Mask (Yıldızlar, gemi yelkenleri ve dümen için mikron netlik)
        blur = cv2.GaussianBlur(enhanced, (0, 0), 1.5)
        sharpened = cv2.addWeighted(enhanced, 1.45, blur, -0.45, 0)

        filename = f"frame_{i+1:04d}.jpg"
        out_path = os.path.join(output_dir, filename)

        # %95 Yüksek Kalite JPEG (Sıfır parazit)
        cv2.imwrite(out_path, sharpened, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        extracted_count += 1

        if (i + 1) % 20 == 0 or i == int(num_frames) - 1:
            print(f"İşleniyor (4K Crystal): {i+1}/{int(num_frames)} kare tamamlandı...")

    cap.release()

    manifest = {
        "totalFrames": extracted_count,
        "extension": "jpg",
        "pattern": "/frames/frame_%04d.jpg",
        "width": target_width,
        "height": target_height,
        "ultraHD": True
    }

    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n[OK] {extracted_count} adet 4K Ultra-HD elmas netliginde kare basariyla '{output_dir}' dizinine kaydedildi.")
    print(f"Manifest güncellendi: '{manifest_path}'.\n")
    return True

if __name__ == "__main__":
    v_path = sys.argv[1] if len(sys.argv) > 1 else "public/media/merhaba_ben_websitem_için_bir.mp4"
    extract_frames(v_path)
