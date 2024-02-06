const path = require('path');
const ESLintPlugin = require('eslint-webpack-plugin');

module.exports = {
	mode: 'production',
	entry: './src/index.js',
	output: {
		path: path.resolve(__dirname, 'build'),
		filename: 'index.js',
		libraryTarget: 'commonjs2',
	},
	module: {
		rules: [
			{
				test: /\.(j|t)sx?$/,
				include: path.resolve(__dirname, 'src'),
				exclude: /(node_modules|bower_components|build)/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: ['@babel/preset-env'],
					},
				},
			},
			{
				test: /\.css$/,
				use: [
					{
						loader: 'style-loader',
					},
					{
						loader: 'css-loader',
					},
				],
				exclude: /node_modules/,
			},
		],
	},
	externals: {
		react: 'commonjs react',
		'react-dom': 'commonjs react-dom',
	},
	plugins: [
		new ESLintPlugin({
			context: path.resolve(__dirname, 'src'),
			extensions: ['js', 'jsx', 'ts', 'tsx'],
		}),
	],
	resolve: {
		extensions: ['.ts', '.tsx', '.js', '.jsx'],
	},
};
