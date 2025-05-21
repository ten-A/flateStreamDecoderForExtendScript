// サンプルストリーム
var raw 
= "8C93DD6ADC301085EFFD14BA6C2F228FA4D14803CB8225AF424A4203F17D584A1A9AFE1092F4FD3BD27A69"
+ "4242228C6D493EE27C3A331EBF66355E645069CE6A182FD566339EEFFFDCAA4F77FB932F979FE5DBD9AC40"
+ "6DB74D90960154BD8CFA29EA9B876F37F74F7FF7BFD4C38F613CBD0275FB388C19AEAB60F93EB0B6C652DB"
+ "B00E3D6962CB2A84A0217250CBEF61032E58703E838B06B0CCE008E42E324FC0E8E51D4583A29137CAF760"
+ "2070128DECA1B85DEE86DD32EC2EDE398279768477B008345358B162CE60C304318995F7305544F60DADAE"
+ "7B8A6D9DFD04C5CB1118653DF5E0D83E1C441DD1D3012731B414720C623BC998C14FA5211449C4D1DC6BEF"
+ "FAEC6DD4C1BAD53E4A714A163B093EA3D8B31304D7EC1DDB96482B22160873C5AA48B122B582398F3D68D8"
+ "8766AC26307EED1F7FE88FC954A40013D6797CB3773A13F25D18C4A431F08AF1CACEEF5A3AA1C89C4CEB8F"
+ "9A444D0A23351CAEDADAF6A96AA9078DFAD02268E7031ED0FEFF55714DCB1DDBF5589C8F52EC410B7D6884"
+ "DA8AE3F1E77F511C406648716E7D9676B24ED85A9D24252A921A71D3BD81D51EFF0418001DEE0A24"
// サンプルストリーム（ここまで）

// 入力バイト列を保持し、展開を行う Inflate クラス
function Inflate(input) 
{
  this.input = input; // 入力バイト列（Uint8配列）
  this.ip = 0; // 現在の読み取り位置
  this.bitBuffer = 0; // ビットバッファ
  this.bitLength = 0; // バッファ内のビット長
  this.output = []; // 出力結果（伸張後のバイト列）
}

// 1バイト読取り（範囲外なら -1）
Inflate.prototype.readByte = function() 
{
  if (this.ip>=this.input.length) return -1;
  return this.input[this.ip++];
};

// nビット読取り
Inflate.prototype.readBits = function(n) 
{
  while (this.bitLength<n) 
  {
    var b = this.readByte();
    if (b<0) return -1;
    this.bitBuffer |= b << this.bitLength;
    this.bitLength += 8;
  }
  var result = this.bitBuffer & ((1 << n) - 1);
  this.bitBuffer >>= n;
  this.bitLength -= n;
  return result;
};

// ビット反転（Huffman符号用）
Inflate.prototype.bitReverse = function(code, length) 
{
  var res = 0;
  for (var i=0; i<length; i++) 
  {
    res = (res << 1) | (code & 1);
    code >>= 1;
  }
  return res;
};

// Huffman符号テーブルの構築
Inflate.prototype.buildHuffmanTable = function(lengths) 
{
  var maxLen = 0;
  var counts = [];
  for (var i = 0; i < lengths.length; i++) 
  {
    var len = lengths[i];
    if (len>maxLen) maxLen = len;
    counts[len] = (counts[len] || 0) + 1;
  }
  counts[0] = 0;

  var code = 0;
  var nextCode = [];
  for (var bits=1; bits<=maxLen; bits++) 
  {
    code = (code + (counts[bits - 1] || 0)) << 1;
    nextCode[bits] = code;
  }

  var table = {};
  for (var n=0; n<lengths.length; n++) 
  {
    var len = lengths[n];
    if (len !== 0) 
    {
      var codeVal = nextCode[len];
      nextCode[len]++;
      var revCode = this.bitReverse(codeVal, len);
      table[revCode + "," + len] = n;
    }
  }

  return { maxLen: maxLen, table: table };
};

// 固定Huffman符号のテーブル作成
Inflate.prototype.buildFixedHuffmanTable = function() 
{
  var lengths = [];
  for (var i= 0; i<=143; i++) lengths[i] = 8;
  for (var i= 144; i<=255; i++) lengths[i] = 9;
  for (var i= 256; i<=279; i++) lengths[i] = 7;
  for (var i= 280; i<=287; i++) lengths[i] = 8;
  return this.buildHuffmanTable(lengths);
};

// Huffman符号のデコード
Inflate.prototype.decodeSymbol = function(huffTable) 
{
  var code = 0;
  for (var len=1; len<=huffTable.maxLen; len++) 
  {
    var bit = this.readBits(1);
    if (bit<0) throw new Error("Unexpected end of input");
    code |= bit << (len - 1);
    var key = code + "," + len;
    if (huffTable.table.hasOwnProperty(key)) 
    {
      return huffTable.table[key];
    }
  }
  throw new Error("Invalid Huffman code");
};

// 展開（メイン関数）
Inflate.prototype.decompress = function() 
{
  var output = this.output;
  var lastBlock = false;

  while (!lastBlock) 
  {
    lastBlock = this.readBits(1) === 1;
    var blockType = this.readBits(2);

    var litLenTable, distTable;

    if (blockType==0) // 非圧縮ブロック（ストアモード）
    {
      this.bitBuffer = 0;
      this.bitLength = 0;
      var len = this.readByte() | (this.readByte() << 8);
      var nlen = this.readByte() | (this.readByte() << 8);
      if ((len^0xFFFF)!==nlen) 
      {
        throw new Error("Invalid uncompressed block length");
      }

      for (var i = 0; i < len; i++) 
      {
        var b = this.readByte();
        if (b < 0) throw new Error("Unexpected end of input in uncompressed block");
        output.push(b);
      }
    } 
    else if (blockType==1) // 固定Huffman符号ブロック
    {
      litLenTable = this.buildFixedHuffmanTable();
      var distLengths = [];
      for (var i=0; i<32; i++) distLengths[i] = 5;
      distTable = this.buildHuffmanTable(distLengths);
    } 
    else if (blockType==2) // 動的Huffman符号ブロック
    {
      var hlit = this.readBits(5) + 257;
      var hdist = this.readBits(5) + 1;
      var hclen = this.readBits(4) + 4;

      var order = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      var codeLengthsCodes = [];
      for (var i=0; i<19; i++) codeLengthsCodes[i] = 0;
      for (var i=0; i<hclen; i++) codeLengthsCodes[order[i]] = this.readBits(3);

      var codeLengthsTable = this.buildHuffmanTable(codeLengthsCodes);

      var lengths = [];
      var total = hlit + hdist;
      var i = 0;
      while (i < total) 
      {
        var sym = this.decodeSymbol(codeLengthsTable);
        if (sym<=15) 
        {
          lengths[i++] = sym;
        } 
        else if (sym==16) 
        {
          var repeat = this.readBits(2) + 3;
          var prev = lengths[i - 1];
          for (var j=0; j<repeat; j++) lengths[i++] = prev;
        } 
        else if (sym==17) 
        {
          var repeat = this.readBits(3) + 3;
          for (var j=0; j<repeat; j++) lengths[i++] = 0;
        } 
        else if (sym==18) 
        {
          var repeat = this.readBits(7) + 11;
          for (var j=0; j<repeat; j++) lengths[i++] = 0;
        } 
        else 
        {
          throw new Error("Invalid code length symbol");
        }
      }

      litLenTable = this.buildHuffmanTable(lengths.slice(0, hlit));
      distTable = this.buildHuffmanTable(lengths.slice(hlit));
    } 
    else 
    {
      throw new Error("Unsupported block type: " + blockType);
    }

    while (true) // デコードループ（長さ／距離ペア）
    {
      var symbol = this.decodeSymbol(litLenTable);
      if (symbol<256) 
      {
        output.push(symbol);
      } 
      else if (symbol==256) 
      {
        break;
      } 
      else 
      {
        var lenExtraBits = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
        var lenBase = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
        var distBase = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,
                                1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
        var distExtraBits = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
        var lenIdx = symbol - 257;
        var len = lenBase[lenIdx] + (this.readBits(lenExtraBits[lenIdx]) || 0);

        var distSym = this.decodeSymbol(distTable);
        var dist = distBase[distSym] + (this.readBits(distExtraBits[distSym]) || 0);

        var outLen = output.length;
        for (var k=0; k<len; k++) 
        {
          output.push(output[outLen - dist + k]);
        }
      }
    }
  }

  return output;
};

// 16進数の文字列をバイト列に変換
var compressedData = [];
for (var i=0;i<raw.length;i++) compressedData.push(Number("0x"+raw[i++]+raw[i]));

// 展開実行
var inflator = new Inflate(compressedData);
var result = inflator.decompress(); //result as raw bytes
var st = "";

// 結果を文字列化して表示
for (var i=0;i<result.length;i++) st += String.fromCharCode(result[i]);
alert(st);
