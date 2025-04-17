use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    program_pack::Pack,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
    pubkey::Pubkey,
    native_token::LAMPORTS_PER_SOL,
};
use spl_token::{
    instruction::initialize_mint,
    state::Mint,
    ID as TOKEN_PROGRAM_ID,
};
use dotenvy::dotenv;
use std::{env, str::FromStr};
use serde_json;


const DEVNET: &str = "https://api.devnet.solana.com";
const EXPLORER: &str = "https://explorer.solana.com";

pub struct Solana {
    pub client: RpcClient,
    pub keypair: Keypair,
}
pub struct MintResult {
    pub address: Pubkey,
    pub url: String,
}

impl Solana {
    pub fn new(url: &str) -> Self {
        let client = RpcClient::new_with_commitment(
            url.to_string(),
            CommitmentConfig::confirmed(),
        );

        dotenv().ok(); // load .env
        
        // read PRIVATE_KEY
        let key_str = env::var("SECRET_KEY").expect("PRIVATE_KEY not found in .env");
        // parse to JSON array[u8]
        let key_bytes: Vec<u8> = serde_json::from_str(&key_str).expect("Invalid JSON array");
        // check length (64 bytes expected)
        assert_eq!(key_bytes.len(), 64, "Expected 64 bytes for private key");
        // create keypair
        let keypair = Keypair::from_bytes(&key_bytes).expect("Invalid keypair bytes");

        Self { client, keypair }
    }

    pub fn balance(&self) -> Result<f64, Box<dyn std::error::Error>> {
        let pubkey = self.keypair.pubkey();
        let lamports = self.client.get_balance(&pubkey)?;
        let sol = lamports as f64 / LAMPORTS_PER_SOL as f64;
        Ok(sol)
    }

    pub fn send(&self, receiver: &str, amount: f64) -> Result<String, Box<dyn std::error::Error>> {
        let to_pubkey = Pubkey::from_str(receiver)?;
        let lamports = (amount * LAMPORTS_PER_SOL as f64).round() as u64;
        // create instruction
        let instruction = system_instruction::transfer(&self.keypair.pubkey(), &to_pubkey, lamports);
       
        // get latest blockhash
        let (recent_blockhash, _) = self.client.get_latest_blockhash_with_commitment(CommitmentConfig::confirmed())?;

        // create transaction
        let tx = Transaction::new_signed_with_payer(
            &[instruction],
            Some(&self.keypair.pubkey()),
            &[&self.keypair],
            recent_blockhash,
        );

        // send transaction
        let signature = self.client.send_and_confirm_transaction(&tx)?;

        Ok(signature.to_string())
    }
    
    // create mint for SPL-token
    pub fn create_mint(
        &self,
        payer: &Keypair, 
        signer: Pubkey, 
        decimals: u8,
    ) -> Result<MintResult, Box<dyn std::error::Error>> {
        // create mint keypair
        let mint = Keypair::new();
        
        // get rent in lamports
        let rent_lamports = self.client.get_minimum_balance_for_rent_exemption(Mint::LEN)?;
        // create account
        let create_account_instruction = system_instruction::create_account(
            &payer.pubkey(),
            &mint.pubkey(),
            rent_lamports,
            Mint::LEN as u64,
            &TOKEN_PROGRAM_ID,
        );
        // initialize mint
        let init_mint_instruction = initialize_mint(
            &TOKEN_PROGRAM_ID,
            &mint.pubkey(),
            &signer,
            None,
            decimals,
        )?;
        // get latest recent blockhash 
        let recent_blockhash = self.client.get_latest_blockhash()?;
        // create transaction
        let transaction = Transaction::new_signed_with_payer(
            &[create_account_instruction, init_mint_instruction],
            Some(&payer.pubkey()),
            &[payer, &mint],
            recent_blockhash,
        );
        self.client.send_and_confirm_transaction(&transaction)?;

        let url = format!(
            "{}/address/{}?cluster=devnet",
            EXPLORER, &mint.pubkey()
        );

        Ok(MintResult {
            address: mint.pubkey(),
            url,
        })
    }
    

}    

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let solana = Solana::new(DEVNET);

    // print pubkey from keypair
    println!("Public Key: {}", solana.keypair.pubkey());

    // send SOL
    match solana.send("4maLLBGGjjPtWVWpA5bGzXiG2fcttoGJN8H6icULzzwM", 0.22) {
        Ok(sig) => println!("Transaction sent: {}", sig),
        Err(err) => eprintln!("Error: {}", err),
    }
    
    // get balance
    match solana.balance() {
        Ok(balance) => println!("Balance in SOL: {:.9} SOL", balance),
        Err(err) => eprintln!("Error: {}", err),
    }
    
    // create mint
    let mint = solana.create_mint(
        &solana.keypair,
        solana.keypair.pubkey(),
        2, // decimals
    )?;
    println!("Mint created: {}", mint.address);
    println!("Explorer URL: {}", mint.url);

    Ok(())
}
