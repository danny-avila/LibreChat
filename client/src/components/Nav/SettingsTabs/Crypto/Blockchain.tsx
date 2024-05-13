import { CryptoId } from 'librechat-data-provider';
import { ReactNode } from 'react';

export interface BlockchainNetwork {
  label: string;
  id: CryptoId;
  icon: ReactNode;
  placeholder: string;
}

export const blockchainNetworks: BlockchainNetwork[] = [
  {
    id: CryptoId.BTC,
    label: 'Bitcoin',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/btc.png" />,
    placeholder: 'Enter your BTC address',
  },
  {
    id: CryptoId.ETH,
    label: 'Ethereum',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/eth.png" />,
    placeholder: 'Enter your ETH address',
  },
  {
    id: CryptoId.BNB,
    label: 'Binance',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/bnb.png" />,
    placeholder: 'Enter your BNB address',
  },
  {
    id: CryptoId.USDT,
    label: 'Tether',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/usdt.png" />,
    placeholder: 'Enter your USDT address',
  },
  {
    id: CryptoId.ADA,
    label: 'Cardano',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/cardano.png" />,
    placeholder: 'Enter your ADA address',
  },
  {
    id: CryptoId.XRP,
    label: 'XRP',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/xrp.png" />,
    placeholder: 'Enter your XRP address',
  },
  {
    id: CryptoId.DOGE,
    label: 'Dogecoin',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/doge.png" />,
    placeholder: 'Enter your DOGE address',
  },
  {
    id: CryptoId.DOT,
    label: 'Polkadot',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/dot.png" />,
    placeholder: 'Enter your DOT address',
  },
  {
    id: CryptoId.BCH,
    label: 'Bitcoin Cash',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/bch.png" />,
    placeholder: 'Enter your BCH address',
  },
  {
    id: CryptoId.UNI,
    label: 'Uniswap',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/uni.png" />,
    placeholder: 'Enter your UNI address',
  },
  {
    id: CryptoId.LTC,
    label: 'Litecoin',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/ltc.png" />,
    placeholder: 'Enter your LTC address',
  },
  {
    id: CryptoId.SOL,
    label: 'Solana',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/sol.png" />,
    placeholder: 'Enter your LTC address',
  },
  {
    id: CryptoId.LINK,
    label: 'Chainlink',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/link.png" />,
    placeholder: 'Enter your LINK address',
  },
  {
    id: CryptoId.MATIC,
    label: 'Litecoin',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/matic.png" />,
    placeholder: 'Enter your MATIC address',
  },
  {
    id: CryptoId.WBTC,
    label: 'Wrapped Bitcoin',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/wbtc.png" />,
    placeholder: 'Enter your WBTC address',
  },
  {
    id: CryptoId.THETA,
    label: 'Theta',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/theta.png" />,
    placeholder: 'Enter your THETA address',
  },
  {
    id: CryptoId.XLM,
    label: 'Stellar',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/xlm.png" />,
    placeholder: 'Enter your XLM address',
  },
  {
    id: CryptoId.DAI,
    label: 'DAI',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/dai.png" />,
    placeholder: 'Enter your DAI address',
  },
  {
    id: CryptoId.ICP,
    label: 'Dfinity',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/icp.png" />,
    placeholder: 'Enter your ICP address',
  },
  {
    id: CryptoId.VET,
    label: 'Vechain',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/vet.png" />,
    placeholder: 'Enter your VET address',
  },
  {
    id: CryptoId.FIL,
    label: 'Filecoin',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/fil.png" />,
    placeholder: 'Enter your FIL address',
  },
  {
    id: CryptoId.TRX,
    label: 'Tron',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/trx.png" />,
    placeholder: 'Enter your TRX address',
  },
  {
    id: CryptoId.EOS,
    label: 'EOS',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/eos.png" />,
    placeholder: 'Enter your EOS address',
  },
  {
    id: CryptoId.XMR,
    label: 'Monero',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/xmr.png" />,
    placeholder: 'Enter your XMR address',
  },
  {
    id: CryptoId.LUNA,
    label: 'Terra',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/luna.png" />,
    placeholder: 'Enter your LUNA address',
  },
  {
    id: CryptoId.AAVE,
    label: 'Aave',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/aave.png" />,
    placeholder: 'Enter your AAVE address',
  },
  {
    id: CryptoId.CAKE,
    label: 'Panecakeswap',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/cake.png" />,
    placeholder: 'Enter your CAKE address',
  },
  {
    id: CryptoId.SHIB,
    label: 'Shiba',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/shib.png" />,
    placeholder: 'Enter your SHIB address',
  },
  {
    id: CryptoId.NEO,
    label: 'NEO',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/neo.png" />,
    placeholder: 'Enter your NEO address',
  },
  {
    id: CryptoId.COMP,
    label: 'Compound',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/comp.png" />,
    placeholder: 'Enter your COMP address',
  },
  {
    id: CryptoId.IOTA,
    label: 'IOTA',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/iota.png" />,
    placeholder: 'Enter your IOTA address',
  },
  {
    id: CryptoId.AVAX,
    label: 'Avalanche',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/avax.png" />,
    placeholder: 'Enter your AVAX address',
  },
  {
    id: CryptoId.DASH,
    label: 'Dash',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/dash.png" />,
    placeholder: 'Enter your DASH address',
  },
  {
    id: CryptoId.NEM,
    label: 'NEM',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/nem.png" />,
    placeholder: 'Enter your NEM address',
  },
  {
    id: CryptoId.ZEC,
    label: 'Zcash',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/zec.png" />,
    placeholder: 'Enter your ZEC address',
  },
  {
    id: CryptoId.SLORP,
    label: 'Slorp',
    icon: <img className="h-6 w-6" src="/assets/cryptocurrency/SlorpCoin.png" />,
    placeholder: 'Enter your SLORP address',
  },
];
