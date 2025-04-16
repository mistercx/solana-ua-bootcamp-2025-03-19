import { 
    Connection, 
    Keypair, 
    PublicKey, 
    Transaction, 
    TransactionInstruction, 
    SystemProgram, 
    sendAndConfirmTransaction,
    NonceAccount,
    LAMPORTS_PER_SOL,
    NONCE_ACCOUNT_LENGTH
 } from "@solana/web3.js";
import { airdropIfRequired  } from "@solana-developers/helpers";
import { 
    createMint, 
    createTransferInstruction,
    createAssociatedTokenAccountInstruction,
    getAccount,
    getOrCreateAssociatedTokenAccount, 
    getAssociatedTokenAddress,
    getMint,
    closeAccount,      
    mintTo,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";

import { createCreateMetadataAccountV3Instruction, createUpdateMetadataAccountV2Instruction } from "@metaplex-foundation/mpl-token-metadata";
import "dotenv/config";
//import * as metadata from '@metaplex-foundation/mpl-token-metadata';
//console.log(Object.keys(Metadata).join('\n'));



// кластера мережі
class Cluster {
    static devnet = {
        name: 'devnet',
        memo: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), // get from https://spl.solana.com/memo
        url: 'https://api.devnet.solana.com',
    }
}

// основний клас
class Solana {
    constructor(cluster) {
        this.cluster = cluster;
        this.explorer = 'https://explorer.solana.com';
        this.connection = new Connection(cluster.url);
        this.token = new Token(this);
        
        const privateKey = process.env["SECRET_KEY"];
        if (privateKey === undefined) {
            console.log("Add SECRET_KEY to .env!");
            process.exit(1);
        }
        this.keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(privateKey)));

        console.log();
        console.log(`\x1b[92mConnected to ${cluster.name}\x1b[0m`);
        console.log(`\x1b[97mPublic key: ${this.keypair.publicKey.toBase58()}\x1b[0m`);
        console.log();
    }

    async airdrop({amount = 1, method = 'helpers'}) {
        switch (method) {
            case 'helpers' : 
                // return amount
                return airdropIfRequired(
                    this.connection,
                    this.keypair.publicKey,
                    amount * LAMPORTS_PER_SOL,
                    0.5 * LAMPORTS_PER_SOL
                )
            
            case 'native' :
                // return signature
                return await this.connection.requestAirdrop(
                    this.keypair.publicKey,
                    amount * LAMPORTS_PER_SOL
                )
            
                default :
                    console.log(`\x1b[91mUnknown method for airdrop\x1b[0m`)
                    process.exit(2);
            
        }

    }

    // check balance
    async balance() {
        return await this.connection.getBalance(this.keypair.publicKey) / LAMPORTS_PER_SOL;
    }

    // send SOL to address (base58)
    async send(amount, wallet, memo) {
        const pubkey = new PublicKey(wallet);
        const transaction = new Transaction();

        let  instruction = SystemProgram.transfer({
            fromPubkey: this.keypair.publicKey,
            toPubkey: pubkey,
            lamports: amount * LAMPORTS_PER_SOL,
        });
        
        transaction.add(instruction);

        // add memo/data to transaction
        if (memo !== undefined) {
            instruction = new TransactionInstruction({
                keys: [{ pubkey: this.keypair.publicKey, isSigner: true, isWritable: true }],
                data: Buffer.from(memo, "utf-8"),
                programId: Cluster.memoProgram,
            });

            transaction.add(instruction);
            console.log(`Add memo: ${memo}`);
        }
          
        return await sendAndConfirmTransaction(this.connection, transaction, [this.keypair,]);
    }
}

// class for tokens
class Token {
    constructor(parent) {
        this.parent = parent;
        this.metadataPID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    }

    // create mint account
    async createMint(signer = this.parent.keypair.publicKey) {
        const account = await createMint(
            this.parent.connection,
            this.parent.keypair,            // payer
            signer,                         // signer
            null,                           // freezer
            2                               // decimals
        );
        account.url = `${solana.explorer}/address/${account.toBase58()}?cluster=${solana.cluster.name}`;
        return account;
    }

    // create token account
    async createAccount(mint, owner) {
        const mintPubkey = new PublicKey(mint);
        const ownerPubKey = new PublicKey(owner);
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
            this.parent.connection,
            this.parent.keypair,            // payer
            mintPubkey,                     // mint
            ownerPubKey                     // owner
        );
        tokenAccount.url = `${solana.explorer}/address/${tokenAccount.address.toBase58()}?cluster=${solana.cluster.name}`;
        return tokenAccount;
    }

    // delete token account
    async deleteAccount(account) {
        const mint = new PublicKey(account);
        const owner = this.parent.keypair.publicKey;
        const address = await getAssociatedTokenAddress(mint, owner);
        const tx = await closeAccount(
            this.parent.connection,
            this.parent.keypair,   // payer
            address,               // account to close
            owner,                 // return balance in SOL
            owner                  // owner of the account to close
        );
        
        console.log(`Account closed. Tx ID: ${tx}`);
    }

    // create multisig account
    async createMultisigAccount(signers) {
        const account = await createMultisig(
            this.parent.connection,
            this.parent.keypair,   // payer
            signers,               // [] of signers 
            signers.length         // minimum need to sign? 
        );
        account.url = `${solana.explorer}/address/${account.toBase58()}?cluster=${solana.cluster.name}`;
        return account;
    }

    // mint tokens
    async mint(mint, account, amount) {
        const tokenMint = new PublicKey(mint); // token account
        const tokenAccount = new PublicKey(account); // token account
        const tx = await mintTo(    
            this.parent.connection,
            this.parent.keypair,            // payer
            tokenMint,                      // mint account
            tokenAccount,                   // token account
            this.parent.keypair.publicKey,  // signer
            amount * Math.pow(10, 2)        // amount
        );
        return tx;
    }

    // mint tokens with multisig
    async mintMultisig(mint, account, signer, amount, signers) {
        const tokenMint = new PublicKey(mint);          // mint
        const tokenAccount = new PublicKey(account);    // token account
        const tokenSigner = new PublicKey(signer);
        const tx = await mintTo(    
            this.parent.connection,
            this.parent.keypair,            // payer
            tokenMint,                      // mint account
            tokenAccount,                   // token account
            tokenSigner,                    // signer
            amount * Math.pow(10, 2),       // amount
            signers
        );
        return tx;
    }


    async createMetadata(mint) {
        const tokenMint = new PublicKey(mint);
        const metadataData = {
            name: "Mister CX",
            symbol: "CX",   // тікер
            description: "Personal meme coin of Serge Khomitsky",
            uri: "https://gateway.pinata.cloud/ipfs/bafkreid4uk3wnstq3a3sfxjgkvm3d55p6wbee2cwla6pfk424raqkczsam",
            image: "https://gateway.pinata.cloud/ipfs/bafkreiho5o7yodhn2ikyupyzu6ikbzf6qolz3y7bidhy3e77dsbzbrlkya", // url на піктограму
            sellerFeeBasisPoints: 300,      // % від вторинного продажу (в базисних пунктах, тобто 300 = 3%)
            creators: [
                {
                    "address": this.parent.keypair.publicKey,
                    "share": 100
                }
            ],
            collection: null,
            uses: null,
        };
        const [metadataPDA, _metadataBump] = PublicKey.findProgramAddressSync(
            [
              Buffer.from("metadata"),
              this.metadataPID.toBuffer(),
              tokenMint.toBuffer(),
            ],
            this.metadataPID
        );

        const transaction = new Transaction();
        const instruction = createCreateMetadataAccountV3Instruction(
            {
                metadata: metadataPDA,
                mint: tokenMint,
                mintAuthority: this.parent.keypair.publicKey,
                payer: this.parent.keypair.publicKey,
                updateAuthority: this.parent.keypair.publicKey,
            },
            {
                createMetadataAccountArgsV3: {
                    collectionDetails: null,
                    data: metadataData,
                    isMutable: true,
                },
            }
        );
        transaction.add(instruction);

        await sendAndConfirmTransaction(
            this.parent.connection,
            transaction,
            [this.parent.keypair]    // sign with private key
        );
    }


    async updateMetadata(mint, uri) {
        const tokenMint = new PublicKey(mint);
        const newMetadata = {
            name: "MisterCX",
            symbol: "MCX",   // тікер
            uri,
            sellerFeeBasisPoints: 300,      // % від вторинного продажу (в базисних пунктах, тобто 300 = 3%)
            creators: [
                {
                    "address": this.parent.keypair.publicKey,
                    "share": 100
                }
            ],
            collection: null,
            uses: null,
            description: "Personal meme coin of Serge Khomitsky",            
            image: "https://gateway.pinata.cloud/ipfs/bafkreiho5o7yodhn2ikyupyzu6ikbzf6qolz3y7bidhy3e77dsbzbrlkya", // url на піктограму
        };

        const [metadataPDA, _metadataBump] = PublicKey.findProgramAddressSync(
            [
              Buffer.from("metadata"),
              this.metadataPID.toBuffer(),
              tokenMint.toBuffer(),
            ],
            this.metadataPID
        );

        const transaction = new Transaction();
        const instruction = createUpdateMetadataAccountV2Instruction(
            {
                metadata: metadataPDA,
                mint: tokenMint,
                mintAuthority: this.parent.keypair.publicKey,
                payer: this.parent.keypair.publicKey,
                updateAuthority: this.parent.keypair.publicKey,
    
            },
            {
                updateMetadataAccountArgsV2: {
                    collectionDetails: null,
                    data: newMetadata,
                    isMutable: true,
                    updateAuthority: this.parent.keypair.publicKey,
                    primarySaleHappened: null,
                }
            }

        );
        transaction.add(instruction);
        const sig = await sendAndConfirmTransaction(
            this.parent.connection,
            transaction,
            [this.parent.keypair]    // sign with private key
        );
        console.log(`✅ Metadata updated!\nTx: ${this.parent.explorer}/tx/${sig}?cluster=devnet`)
    }

    /*
    async createMetadataWithMultisig(mint, authority, signers) {
        const tokenMint = new PublicKey(mint);
        const mintAuthority = new PublicKey(authority);
      
        const [metadataPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            this.metadataPID.toBuffer(),
            tokenMint.toBuffer(),
          ],
          this.metadataPID
        );
      
        const metadataData = {
          name: "MultiSignCoin",
          symbol: "MSC",
          "description": "Multisign meme coin of Serge Khomitsky",
          uri: "https://gateway.pinata.cloud/ipfs/bafkreihigueiog4wdhsmyiumlv6crde5mymbeei4mfc62ngphxde2fruja",
          sellerFeeBasisPoints: 100,
          creators: null,
          collection: null,
          uses: null,
        };
      
        const instruction = createCreateMetadataAccountV3Instruction(
          {
            metadata: metadataPDA,
            mint: tokenMint,
            mintAuthority: mintAuthority,
            payer: this.parent.keypair.publicKey,
            updateAuthority: mintAuthority,
          },
          {
            createMetadataAccountArgsV3: {
              data: metadataData,
              isMutable: true,
              collectionDetails: null
            }
          }
        );

        signers.forEach(signer => {
            instruction.keys.push({
              pubkey: signer.publicKey,
              isSigner: true,
              isWritable: false
            });
          });

        const mintAuthIndex = instruction.keys.findIndex(k =>
            k.pubkey.equals(mintAuthority)
        );
          
        if (mintAuthIndex !== -1) {
            instruction.keys[mintAuthIndex].isSigner = false;
        }

        console.log(instruction.keys.filter(k => k.isSigner));
      
        const transaction = new Transaction().add(instruction);
        const allSigners = [this.parent.keypair, ...signers];
        

        const sig = await sendAndConfirmTransaction(
          this.parent.connection,
          transaction,
          allSigners
        );
        
      
        console.log(`✅ Metadata created!\nTx: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    }
    */

    // send token to ATA
    async send(mintAccount, recipientAccount, amount, memo) {
        const mint = new PublicKey(mintAccount);
        const recipient = new PublicKey(recipientAccount);
        const sender = this.parent.keypair;
        const transaction = new Transaction();
        
        // get ATA for sender/receiver
        const senderTokenAccount = await getAssociatedTokenAddress(mint, sender.publicKey);
        const recipientTokenAccount = await getAssociatedTokenAddress(mint, recipient);

        // get current balance
        const accountInfo = await getAccount(this.parent.connection, senderTokenAccount);
        const mintInfo = await getMint(this.parent.connection, mint);
        const decimals = mintInfo.decimals;
        console.log(`Account: ${accountInfo.address.toBase58()}`);
        console.log(`Current balance: ${accountInfo.amount.toString()}`);
        console.log(`Decimals: ${mintInfo.decimals}`);
        console.log();
        

        // check receiver ATA exists
        let instructions = [];
        try {
            await getAccount(this.parent.connection, recipientTokenAccount);
            console.log(`[INFO]: check receiver ATA exists ... YES`);
        } catch (err) {
            console.log(`[WARNING]: check receiver ATA exists ... NO`);
            console.log(`Try to create recipient ATA ...`);
            instructions.push(
              createAssociatedTokenAccountInstruction(
                sender.publicKey,         // payer
                recipientTokenAccount,    // recipient ATA
                recipient,                // recipient
                mint,                     // mintAuthority
                TOKEN_PROGRAM_ID,         
                ASSOCIATED_TOKEN_PROGRAM_ID
              )
            );
        }
        // add transfer to instruction
        instructions.push(
            createTransferInstruction(
              senderTokenAccount,
              recipientTokenAccount,
              sender.publicKey,         // sender
              amount * 10 ** decimals,  // amount
              [],                       // multisigners
              TOKEN_PROGRAM_ID
            )
        );

        // send transaction
        const tx = new Transaction().add(...instructions);
        return await sendAndConfirmTransaction(this.parent.connection, tx, [sender]);
    }

    // partial sign with serialize
    async serialize(mintAccount, recipientAccount, amount) {
        const mint = new PublicKey(mintAccount);
        const recipient = new PublicKey(recipientAccount);
        const sender = this.parent.keypair;
                
        // get ATA for sender/receiver
        const senderTokenAccount = await getAssociatedTokenAddress(mint, sender.publicKey);
        const recipientTokenAccount = await getAssociatedTokenAddress(mint, recipient);

        // create instruction
        const transferIx = createTransferInstruction(
            senderTokenAccount,
            recipientTokenAccount,
            sender.publicKey,       // authority
            amount * 10 ** 2,       // amount
            [],                     // multisigners
            TOKEN_PROGRAM_ID
        );
        
        // create transaction
        const tx = new Transaction().add(transferIx);
        tx.feePayer = recipient;   // receiver is payer
        tx.recentBlockhash = (await this.parent.connection.getLatestBlockhash()).blockhash;

        // sign sender only
        tx.partialSign(sender);

        const serialized = tx.serialize({
            requireAllSignatures: false, // !!! important
        });
        console.log(`Serialized transaction:`);
        console.log(serialized);
        console.log(`Serialized transaction (base64):`);
        console.log(serialized.toString('base64'));
        return serialized
    }

    // sign serialized transaction
    async sign(serializedTx, signerKeypair) {
        const tx = Transaction.from(serializedTx);
        tx.partialSign(signerKeypair); // add sign from recipient (fee payer)
        
        const signature = await this.parent.connection.sendRawTransaction(tx.serialize());
        console.log(`Confirmed with signature: ${signature}`);
        return signature
    }

    async createNonce() {
        // create nonce account
        const nonceAccount = Keypair.generate();
        // space for nonce
        const lamports = await this.parent.connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
        console.log(`Estimated fee: ${lamports / 10**9} SOL for ${NONCE_ACCOUNT_LENGTH} bytes!`);

        const transaction = new Transaction().add(
            SystemProgram.createNonceAccount({
                fromPubkey: this.parent.keypair.publicKey,
                noncePubkey: nonceAccount.publicKey,
                authorizedPubkey: this.parent.keypair.publicKey,    // payer?
                lamports
            }),
        );
        // send transaction
        await sendAndConfirmTransaction(this.parent.connection, transaction, [this.parent.keypair, nonceAccount]);
        // get nonce data
        const nonceAccountData = await this.parent.connection.getNonce(
            nonceAccount.publicKey,
            'confirmed',
        );
        return {
            keypair: nonceAccount,
            nonce: nonceAccountData.nonce
        };
    }

    async serializeWithNonce(mintAccount, recipientAccount, amount) {
        const mint = new PublicKey(mintAccount);
        const recipient = new PublicKey(recipientAccount);
        const sender = this.parent.keypair;
        const {keypair, nonce} = await this.createNonce();
                
        // get ATA for sender/receiver
        const senderTokenAccount = await getAssociatedTokenAddress(mint, sender.publicKey);
        const recipientTokenAccount = await getAssociatedTokenAddress(mint, recipient);

        // create instruction
        const instruction = createTransferInstruction(
            senderTokenAccount,
            recipientTokenAccount,
            sender.publicKey,       // authority
            amount * 10 ** 2,       // amount
            [],                     // multisigners
            TOKEN_PROGRAM_ID
        );

        
        // create transaction
        const transaction = new Transaction().add(instruction);
        
        transaction.feePayer = recipient;   // receiver is payer
        transaction.nonceInfo = {
            nonce,
            nonceInstruction: SystemProgram.nonceAdvance({
                noncePubkey: keypair.publicKey,            // nonce pubkey
                authorizedPubkey: this.parent.keypair.publicKey,  // sender keypair
            }),
        }

        // sign as sender
        transaction.partialSign(this.parent.keypair);

        // serializing + base64
        const serialized = transaction.serialize({
            requireAllSignatures: false, // sign as receiver will later
            verifySignatures: false,
        });

        const base64tx = serialized.toString('base64');
        console.log(`Serialized transaction (base64): ${base64tx}`);
        return base64tx;
    }

    // sign serialized transaction
    async signFrom(base64tx, signerKeypair) {
        const buffer = Uint8Array.from(atob(base64tx), c => c.charCodeAt(0));
        const transaction = Transaction.from(buffer);
        transaction.partialSign(signerKeypair); // add sign from recipient (fee payer)
            
        return await this.parent.connection.sendRawTransaction(transaction.serialize());
    }
    
}


const solana = new Solana(Cluster.devnet);

//const signature = await solana.airdrop({amount: 5, method: 'native'});
//console.log(`Airdrop signature: ${signature}`);

//const signature = await solana.send(0.12, '4maLLBGGjjPtWVWpA5bGzXiG2fcttoGJN8H6icULzzwM', 'My memo text in transaction');
//console.log(`Transaction confirmed, signature: ${signature}`);

//const balance = await solana.balance();
//console.log(`Balance in SOL: ${balance}`);

//const mint = await solana.token.createMint();
//console.log(`Token Mint: ${mint.toBase58()}; url: ${mint.url}`);

//const account = await solana.token.createAccount('5HRum3cW9VXwU4K9Ld8zmTFpoVHQPuuAtndctR5S3LXC','HE5KDDCNhaCxBLFVBfBeLo3YiKQQH41Bc6Yfm7meYRSC');
//console.log(`Token Account: ${account.address.toBase58()}; url: ${account.url}`);

//await solana.token.deleteAccount('EFAbMjrxpCJDKo2mnvbfjPHFq5Ne1nWxngmGKaV667D3');

/*
const tx = await solana.token.mint(
    'Bnb1u8WnZR3LzgvgtJ5KQ4ZUUQB1pVAiku4X4mbiJpv4', // mint account
    'BGMsu1idJwgfCPbro2pyC5Womv6xWNb231ggZMGA1Kbg', // tocken account
    1000                                            // amount
);

console.log("Success!");
console.log(`Mint Token Transaction: ${solana.explorer}/tx/${tx}?cluster=${solana.cluster.name}`);
*/

/*
await solana.token.updateMetadata(
    'Bnb1u8WnZR3LzgvgtJ5KQ4ZUUQB1pVAiku4X4mbiJpv4', // mint account
    'https://gateway.pinata.cloud/ipfs/bafkreiaqodnqopj42kfi7we7dr6gttzdy3sq5bz7pyuacuqzmz77jae4nq' // url for new JSON-data
);
*/

//await solana.token.getTokenName('Bnb1u8WnZR3LzgvgtJ5KQ4ZUUQB1pVAiku4X4mbiJpv4');


//const account = await solana.token.createMultisigAccount(
//    [solana.keypair.publicKey, new PublicKey('4maLLBGGjjPtWVWpA5bGzXiG2fcttoGJN8H6icULzzwM')]
//)
//console.log(`Created multisig account: ${account.toBase58()}; url: ${account.url}`);


//const mint = await solana.token.createMint(new PublicKey('3PXebtqA1KUhe168gjubpCi3jUqRX3hizSHLDzMvt9JR'));
//console.log(`Multisig Token Mint: ${mint.toBase58()}; url: ${mint.url}`);


const secondKey = process.env["SECOND_KEY"];
if (secondKey === undefined) {
    console.log("Add SECOND_KEY to .env!");
    process.exit(1);
}
const secondKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secondKey)));
/*
const tx = await solana.token.mintMultisig(
    '5HRum3cW9VXwU4K9Ld8zmTFpoVHQPuuAtndctR5S3LXC', // mint account
    'B8LsTYNJz5LVHzTJZqJhAELP1yEZKhwQ7NAr5Hyv1HnT', // tocken account
    'HE5KDDCNhaCxBLFVBfBeLo3YiKQQH41Bc6Yfm7meYRSC', // signer account (multisig)
    1000,                                           // amount
    [solana.keypair, secondKeypair]                 // signers
);

console.log("Success!");
console.log(`Mint Token Transaction: ${solana.explorer}/tx/${tx}?cluster=${solana.cluster.name}`);
*/

/*
await solana.token.createMetadataWithMultisig(
    '5HRum3cW9VXwU4K9Ld8zmTFpoVHQPuuAtndctR5S3LXC', // mint
    'HE5KDDCNhaCxBLFVBfBeLo3YiKQQH41Bc6Yfm7meYRSC', // mint authority
    [secondKeypair]                 // signers
);
*/ 

/*
const signature = await solana.token.send(
    'Bnb1u8WnZR3LzgvgtJ5KQ4ZUUQB1pVAiku4X4mbiJpv4', // mint account
    '4maLLBGGjjPtWVWpA5bGzXiG2fcttoGJN8H6icULzzwM', // recipient (Solana account)
    10
);
console.log(`Transaction confirmed, signature: ${signature}`);
*/

/*
const serialized = await solana.token.serialize(
    'Bnb1u8WnZR3LzgvgtJ5KQ4ZUUQB1pVAiku4X4mbiJpv4', // mint account
    '4maLLBGGjjPtWVWpA5bGzXiG2fcttoGJN8H6icULzzwM', // recipient (Solana account)
    20
);
const base64 = 'AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADA/0q+nVhb3VdiZzwweUdw34lHrU/uab6O9Rd/KrbzaZFIUONsmwartXBmI/s2bKy7P5AEC/UhXzZSm89pfi4CAgEBBTf+TnM9+b+LpoJXVHcw6cItx0FzlRpszOADI3Zcb66MBSvHcdIWAHGp2W+u0qAj0lCFY863ChjnSZEETce0WuGH+4qAHHPLISnAhBwUJwet3SzeOdNmTpM08sTzxhkVtJiEMA0DZ5aq/Ly53FND0nO2hxwO2oSOWjlF+EdtsfhTBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKmlzfq4OanFLBiTunIeHR71PM9LMLgPA+w4Ja9qALrZhgEEAwMCAQkD0AcAAAAAAAA='
const serialized = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
const signature = await solana.token.sign(serialized, secondKeypair);
*/

//await solana.token.createNonce();
/*
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

console.log(new Date().toLocaleString());
const base64tx = await solana.token.serializeWithNonce(
    'Bnb1u8WnZR3LzgvgtJ5KQ4ZUUQB1pVAiku4X4mbiJpv4', // mint account
    '4maLLBGGjjPtWVWpA5bGzXiG2fcttoGJN8H6icULzzwM', // recipient (Solana account)
    50  // amount (50 MCX)
)

console.log(`Awaiting 5 minutes before continue ...`);
await sleep(5 * 60 * 1000);
*/
console.log(new Date().toLocaleString());
const base64tx = 'AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABo5EsbwCeaYZweT6FTbG1TgkdQxJyG5ZRTtm31QOEt0CFSylSmT2SHNU27OWiIccltGvbiGqQFbocH2hL/5aMAAgEDCDf+TnM9+b+LpoJXVHcw6cItx0FzlRpszOADI3Zcb66MBSvHcdIWAHGp2W+u0qAj0lCFY863ChjnSZEETce0WuF+rmUD8asn5Jelv9AvKhE8WFTXjWJGjnu5t9AtCv/XNYf7ioAcc8shKcCEHBQnB63dLN4502ZOkzTyxPPGGRW0mIQwDQNnlqr8vLncU0PSc7aHHA7ahI5aOUX4R22x+FMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAan1RcZLFaO4IqEX3PSl4jPA1wxRbIas0TYBi6pQAAABt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKns8m30X6fO6QtNGAdoZaYtaq5SiSpW+v6ysbTnZLTmRgIFAwIGAQQEAAAABwMEAwEJA4gTAAAAAAAA';
const signature = await solana.token.signFrom(base64tx, secondKeypair);
console.log(`Confirmed with signature: ${signature}`);

