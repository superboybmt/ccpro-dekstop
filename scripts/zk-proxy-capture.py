import argparse
import socket
import threading
import time
from pathlib import Path


TCP_TOP_MAGIC_1 = 0x5050
TCP_TOP_MAGIC_2 = 0x7D82


def ascii_preview(data: bytes) -> str:
    chars = []
    for byte in data:
        if 32 <= byte <= 126:
            chars.append(chr(byte))
        else:
            chars.append(".")
    return "".join(chars)


def parse_frames(chunk: bytes):
    offset = 0
    frames = []
    while offset + 8 <= len(chunk):
        top1, top2, length = int.from_bytes(chunk[offset:offset + 2], "little"), int.from_bytes(chunk[offset + 2:offset + 4], "little"), int.from_bytes(chunk[offset + 4:offset + 8], "little")
        if top1 != TCP_TOP_MAGIC_1 or top2 != TCP_TOP_MAGIC_2 or length <= 0:
            break
        frame_end = offset + 8 + length
        if frame_end > len(chunk):
            break
        body = chunk[offset + 8:frame_end]
        command = int.from_bytes(body[0:2], "little") if len(body) >= 2 else None
        checksum = int.from_bytes(body[2:4], "little") if len(body) >= 4 else None
        session = int.from_bytes(body[4:6], "little") if len(body) >= 6 else None
        reply = int.from_bytes(body[6:8], "little") if len(body) >= 8 else None
        payload = body[8:]
        frames.append(
            {
                "length": length,
                "command": command,
                "checksum": checksum,
                "session": session,
                "reply": reply,
                "payload": payload,
            }
        )
        offset = frame_end
    return frames, chunk[offset:]


class Relay:
    def __init__(self, client, server, log_path: Path):
        self.client = client
        self.server = server
        self.log_path = log_path
        self.lock = threading.Lock()
        self.stop_event = threading.Event()

    def log(self, direction: str, data: bytes):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        frames, remainder = parse_frames(data)
        lines = [f"{timestamp} {direction} bytes={len(data)}"]
        if frames:
            for index, frame in enumerate(frames, start=1):
                payload = frame["payload"]
                lines.append(
                    "  frame[{idx}] cmd={cmd} session={session} reply={reply} payload={payload_len} ascii={ascii} hex={hex}".format(
                        idx=index,
                        cmd=frame["command"],
                        session=frame["session"],
                        reply=frame["reply"],
                        payload_len=len(payload),
                        ascii=ascii_preview(payload[:120]),
                        hex=payload[:120].hex(),
                    )
                )
        else:
            lines.append(f"  raw ascii={ascii_preview(data[:120])}")
            lines.append(f"  raw hex={data[:120].hex()}")
        if remainder:
            lines.append(f"  remainder={remainder[:120].hex()}")
        with self.lock:
            with self.log_path.open("a", encoding="utf-8") as handle:
                handle.write("\n".join(lines))
                handle.write("\n")

    def pipe(self, source, target, direction):
        try:
            while not self.stop_event.is_set():
                data = source.recv(8192)
                if not data:
                    break
                self.log(direction, data)
                target.sendall(data)
        finally:
            self.stop_event.set()
            try:
                target.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                target.close()
            except OSError:
                pass
            try:
                source.close()
            except OSError:
                pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen-host", default="127.0.0.1")
    parser.add_argument("--listen-port", type=int, required=True)
    parser.add_argument("--target-host", required=True)
    parser.add_argument("--target-port", type=int, required=True)
    parser.add_argument("--log-path", required=True)
    args = parser.parse_args()

    log_path = Path(args.log_path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("", encoding="utf-8")

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind((args.listen_host, args.listen_port))
    listener.listen(1)

    try:
        client, _ = listener.accept()
        server = socket.create_connection((args.target_host, args.target_port), timeout=10)
        relay = Relay(client, server, log_path)
        threads = [
            threading.Thread(target=relay.pipe, args=(client, server, "C2S"), daemon=True),
            threading.Thread(target=relay.pipe, args=(server, client, "S2C"), daemon=True),
        ]
        for thread in threads:
            thread.start()
        while not relay.stop_event.is_set():
            time.sleep(0.1)
    finally:
        listener.close()


if __name__ == "__main__":
    main()
