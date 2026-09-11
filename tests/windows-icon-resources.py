"""Compare compiled Windows icon resources with the approved ICO exports.

Optional verification dependency: pefile. Pass one or more packaged EXE paths.
"""
import struct
import sys
from pathlib import Path
import pefile

source = Path('assets/icon.ico').read_bytes()
expected = []
for index in range(struct.unpack_from('<H', source, 4)[0]):
    size, offset = struct.unpack_from('<II', source, 6 + 16 * index + 8)
    expected.append(source[offset:offset + size])
for executable in sys.argv[1:]:
    pe = pefile.PE(executable, fast_load=True)
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE']])
    actual = []
    for kind in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        if kind.id == 3:
            for resource in kind.directory.entries:
                for language in resource.directory.entries:
                    data = language.data.struct
                    actual.append(pe.get_data(data.OffsetToData, data.Size))
    assert all(image in actual for image in expected), executable
    print(f'PASS {executable}: {len(expected)}/{len(expected)} exact approved ICO resources')
