// Amazon EventStream framing, per https://smithy.io/2.0/aws/amazon-eventstream.html.
// No Node APIs: Bob runs this decoder in JavaScriptCore, only for ConverseStream.
var crcTable;
function crc32(bytes, start, end) {
    if (!crcTable) {
        crcTable = [];
        for (var n = 0; n < 256; n += 1) {
            var c = n;
            for (var k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    var crc = 0xffffffff;
    for (var i = start || 0; i < (end === undefined ? bytes.length : end); i += 1) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function uint32(bytes, at) { return (bytes[at] * 16777216 + (bytes[at+1] << 16) + (bytes[at+2] << 8) + bytes[at+3]) >>> 0; }
function decoder(decodeUtf8, receive) {
    var pending = [];
    return {
        feed: function (bytes) {
            pending = pending.concat(Array.prototype.slice.call(bytes));
            var offset = 0;
            while (pending.length - offset >= 12) {
                var total = uint32(pending, offset), headersLength = uint32(pending, offset + 4);
                if (total < 16 || headersLength > total - 16) throw new Error('AWS 流式帧长度无效');
                if (crc32(pending, offset, offset+8) !== uint32(pending, offset+8)) throw new Error('AWS 流式帧头校验失败');
                // A local memory budget, not the service's payload-size validation.
                if (total > 33554432) throw new Error('AWS 单帧超过本地 32 MiB 内存预算');
                if (pending.length - offset < total) break;
                if (crc32(pending, offset, offset+total-4) !== uint32(pending, offset+total-4)) throw new Error('AWS 流式帧校验失败');
                var headers = Object.create(null), at = offset+12, end = at+headersLength;
                while (at < end) {
                    var nameLength = pending[at++];
                    if (!nameLength || at+nameLength+1 > end) throw new Error('AWS 流式帧头不完整');
                    var name = decodeUtf8(pending.slice(at, at+nameLength)); at += nameLength;
                    if (Object.prototype.hasOwnProperty.call(headers, name)) throw new Error('AWS 流式帧头重复');
                    var type = pending[at++], count = [0,0,1,2,4,8,-1,-1,8,16][type], value = null;
                    if (count === undefined) throw new Error('AWS 流式帧头类型无效');
                    if (count === -1) {
                        if (at+2 > end) throw new Error('AWS 流式帧头长度缺失');
                        count = pending[at]*256 + pending[at+1]; at += 2;
                    }
                    if (at+count > end) throw new Error('AWS 流式帧头越界');
                    if (type === 7) value = decodeUtf8(pending.slice(at, at+count));
                    else if (type === 0 || type === 1) value = type === 0;
                    headers[name] = value; at += count;
                }
                receive(headers, decodeUtf8(pending.slice(end, offset+total-4)));
                offset += total;
            }
            pending = pending.slice(offset);
        },
        finish: function () { if (pending.length) throw new Error('AWS 流式帧提前结束'); },
    };
}
module.exports = { decoder: decoder, crc32: crc32 };
