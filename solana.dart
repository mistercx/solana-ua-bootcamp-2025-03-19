import 'package:dotenv/dotenv.dart';
import 'package:solana/dto.dart';
import 'package:solana/solana.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:math';

String URL = 'https://api.devnet.solana.com';


class Solana {
  final String url;
  final RpcClient client;
  List<int>? secretKey;
  String? publicKey;

  // конструктор
  Solana({required this.url}) : client = RpcClient(url);

  // Генерація нового ключа (кошелька)
  Future<void> generate() async {
    Ed25519HDKeyPair keypair = await Ed25519HDKeyPair.random();
    Ed25519HDKeyPairData extracted = await keypair.extract();
    secretKey = [...extracted.bytes, ...keypair.publicKey.bytes];
    publicKey = keypair.address;
  }

  // load secret key from .env
  Future<void> load() async {
    DotEnv env = DotEnv(includePlatformEnvironment: true)..load();
    String? data = env['SECRET_KEY'];
    if (data != null) {
      final List<dynamic> jsonList = jsonDecode(data);
      final Uint8List privateKey = Uint8List.fromList(jsonList.cast<int>()).sublist(0,32);
      // відновлення пари ключів
      Ed25519HDKeyPair keypair = await Ed25519HDKeyPair.fromPrivateKeyBytes(privateKey: privateKey);
      Ed25519HDKeyPairData extracted = await keypair.extract();
      secretKey = [...extracted.bytes, ...keypair.publicKey.bytes];
      publicKey = keypair.address;
    }
  }

  Future<int> balance() async {
    BalanceResult balanceResult = await client.getBalance(publicKey!);
    return balanceResult.value;
  }
}


void main() async {
  Solana solana = Solana(url: URL);

  // Генерація нового ключа (гаманця)
  //await solana.generate();

  // Завантаження гаманця з .env
  await solana.load();

  // Читання балансу
  int balance = await solana.balance();

  print('Public address: ${solana.publicKey}');
  print('Balance in SOL: ${balance / pow(10, 9)}');

}
