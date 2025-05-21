### Flate Stream Decoder for ExtendScript.

This script is intended for decompression of compressed streams written in binary in PDF using ExtendScript engines such as Adobe Illustrator, etc. It is written with the goal of implementing the Deflate definition faithfully. Note that little consideration has been given to performance.

FlateStream in PDF may contain headers and checksums. They need to be removed before handed over to this code.
