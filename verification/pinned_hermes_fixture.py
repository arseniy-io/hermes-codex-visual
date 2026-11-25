"""Read stock installer fixtures without using the running Hermes files."""

import io
import subprocess
import tarfile


BASELINE = "6a0d2d12815c0546b0bcaf05046e2fe3293f60aa"


def read_stock_sources(core, names):
    archive = subprocess.run(
        ["git", "-C", str(core), "archive", "--format=tar", BASELINE, "--", *names],
        check=True, capture_output=True,
    ).stdout
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as snapshot:
        return {name: snapshot.extractfile(name).read() for name in names}
