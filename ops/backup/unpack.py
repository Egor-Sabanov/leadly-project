"""Extract only regular files/directories from our decrypted backup, never links."""
import pathlib
import shutil
import sys
import tarfile

root = pathlib.Path(sys.argv[2]).resolve()
with tarfile.open(sys.argv[1]) as archive:
    members = archive.getmembers()
    if len(members) > 20000 or sum(member.size for member in members) > 2147483648:
        raise ValueError("archive_limit_exceeded")
    for member in members:
        target = (root / member.name).resolve()
        if not target.is_relative_to(root) or not (member.isfile() or member.isdir()):
            raise ValueError("unsafe_archive")
        if member.size < 0 or member.size > 1073741824:
            raise ValueError("archive_limit_exceeded")
    for member in members:
        target = (root / member.name).resolve()
        if member.isdir():
            target.mkdir(mode=0o700, parents=True, exist_ok=True)
        else:
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with archive.extractfile(member) as source, target.open("xb") as output:
                shutil.copyfileobj(source, output)
            target.chmod(0o600)
