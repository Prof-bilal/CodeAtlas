"""Generate speech from the public tutorial script, never repository source.

Optional dependency: edge-tts 7.2.8 in an isolated Python environment.
The speech service receives only public scene narration paragraphs.
Use --marketing for the separate promotional film; default tutorial paths persist.
"""
import asyncio
import array
import io
import json
import math
import subprocess
import sys
import wave
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "examples/beta-video"
MARKETING = "--marketing" in sys.argv
if MARKETING:
    sys.argv.remove("--marketing")
DATA = PROJECT / "src/marketing" if MARKETING else PROJECT / "src"
AUDIO_PATH = "marketing/audio" if MARKETING else "audio"
SUPPLEMENTS = PROJECT / "marketing" if MARKETING else PROJECT
SUPPLEMENTS.mkdir(parents=True, exist_ok=True)
FFPROBE = PROJECT / "node_modules/@remotion/compositor-linux-x64-gnu/ffprobe"
FPS = 24
SAMPLE_RATE = 24000


def mix_audio(scenes):
    """One continuous, sample-aligned track avoids large renderer mixing jobs."""
    ffmpeg = FFPROBE.with_name("ffmpeg")
    destination = PROJECT / "public" / AUDIO_PATH / "narration.wav"
    with wave.open(str(destination), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        for scene in scenes:
            encoded = subprocess.check_output([
                str(ffmpeg), "-v", "error", "-i", str(PROJECT / "public" / scene["audio"]),
                "-f", "wav", "-c:a", "pcm_s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "pipe:1"
            ])
            with wave.open(io.BytesIO(encoded), "rb") as decoded:
                pcm = decoded.readframes(decoded.getnframes())
            target_bytes = scene["durationInFrames"] * (SAMPLE_RATE // FPS) * 2
            if len(pcm) > target_bytes:
                raise RuntimeError("Narration exceeds its scene; refusing to clip speech")
            output.writeframes(pcm)
            output.writeframes(bytes(target_bytes - len(pcm)))
    print(f"Mixed narration: {destination}", flush=True)
    if MARKETING:
        add_marketing_score(destination)


def add_marketing_score(destination):
    """Original quiet instrumental bed; no third-party recording or samples."""
    with wave.open(str(destination), "rb") as source:
        voice = array.array("h", source.readframes(source.getnframes()))
    music = array.array("h")
    chords = [(220, 261.63, 329.63), (174.61, 220, 261.63),
              (130.81, 164.81, 196), (196, 246.94, 293.66)]
    duration = len(voice) / SAMPLE_RATE
    for index, sample in enumerate(voice):
        t = index / SAMPLE_RATE
        fade = min(1, t / 2, max(0, (duration - t) / 3))
        chord_index = int(t / 4.8) % len(chords)
        chord = chords[chord_index]
        blend = min(1, (t % 4.8) / 0.4)
        previous = chords[(chord_index - 1) % len(chords)]
        pad = (sum(math.sin(2 * math.pi * hz * t) for hz in chord) * blend +
               sum(math.sin(2 * math.pi * hz * t) for hz in previous) * (1 - blend)) * 0.006
        beat = t % 0.6
        note = chord[int(t / 0.6) % 3] * 2
        arp = math.sin(2 * math.pi * note * t) * math.exp(-beat * 8) * min(1, beat / 0.018) * 0.012
        value = round((pad + arp) * fade * 32767)
        music.append(value)
        mixed = sample + value
        if not -32768 <= mixed <= 32767:
            raise RuntimeError("Soundtrack would clip; reduce its amplitude")
        voice[index] = mixed
    for path, samples in [(destination, voice), (destination.with_name("music.wav"), music)]:
        with wave.open(str(path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(SAMPLE_RATE)
            output.writeframes(samples.tobytes())
    print("Mixed original instrumental score beneath narration", flush=True)


async def generate(index, scene):
    filename = f"{index + 1:02}.mp3"
    destination = PROJECT / "public" / AUDIO_PATH / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    words = []
    communicate = edge_tts.Communicate(
        scene["narration"], "en-US-GuyNeural" if MARKETING else "en-US-AriaNeural",
        rate="+10%" if MARKETING else "+20%"
    )
    with destination.open("wb") as audio:
        async for item in communicate.stream():
            if item["type"] == "audio":
                audio.write(item["data"])
            elif item["type"] in ("WordBoundary", "SentenceBoundary"):
                words.append({
                    "start": item["offset"] / 10_000_000,
                    "end": (item["offset"] + item["duration"]) / 10_000_000,
                    "text": item["text"],
                })
    duration = float(subprocess.check_output([
        str(FFPROBE), "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(destination)
    ], text=True).strip())
    scene["audio"] = AUDIO_PATH + "/" + filename
    scene["durationInFrames"] = math.ceil(max(8 if MARKETING else 20, duration + 1.6) * FPS)
    scene["captions"] = words
    print(f"Scene {index + 1:02}: {duration:.1f}s", flush=True)
    return scene


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    return f"{milliseconds // 3600000:02}:{milliseconds // 60000 % 60:02}:{milliseconds // 1000 % 60:02},{milliseconds % 1000:03}"


async def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--mix-only":
        mix_audio(json.loads((DATA / "timeline.json").read_text()))
        return
    scenes = json.loads((DATA / "scenes.json").read_text())
    selected = int(sys.argv[1]) - 1 if len(sys.argv) > 1 else None
    previous = json.loads((DATA / "timeline.json").read_text()) if selected is not None else []
    rendered = []
    for index, scene in enumerate(scenes):
        rendered.append(await generate(index, scene) if selected is None or index == selected else previous[index])
    (DATA / "timeline.json").write_text(json.dumps(rendered, indent=2) + "\n")
    subtitles, chapters, transcript = [], [], []
    seconds = 0
    for scene in rendered:
        chapters.append(f"{int(seconds) // 60:02}:{int(seconds) % 60:02} {scene['title'].replace(chr(10), ' ')}")
        transcript.extend([f"## {chapters[-1]}", "", scene["narration"], ""])
        for caption in scene["captions"]:
            subtitles.extend([
                str(len(subtitles) // 4 + 1),
                f"{timestamp(seconds + caption['start'])} --> {timestamp(seconds + caption['end'])}",
                caption["text"], ""
            ])
        seconds += scene["durationInFrames"] / FPS
    captions = PROJECT / "public/marketing/captions.srt" if MARKETING else PROJECT / "public/captions.srt"
    captions.write_text("\n".join(subtitles))
    (SUPPLEMENTS / "CHAPTERS.txt").write_text("\n".join(chapters) + "\n")
    (SUPPLEMENTS / "TRANSCRIPT.md").write_text("# CodeAtlas narration\n\n" + "\n".join(transcript))
    print(f"Total duration: {seconds:.2f}s", flush=True)
    minimum, maximum = (60, 120) if MARKETING else (300, 600)
    if not minimum <= seconds <= maximum:
        raise RuntimeError(f"Video must stay within {minimum}–{maximum} seconds")
    mix_audio(rendered)


asyncio.run(main())
