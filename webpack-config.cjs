const path = require("path");

/**
 * App Builder merges this config when bundling TypeScript actions (`aio app build`).
 * ts-loader must use tsconfig.webpack.json: the root tsconfig.json sets `noEmit: true`
 * for `npm run build` / `tsc --noEmit`; with that file, ts-loader would emit no JS and fail.
 */
module.exports = {
  target: "node22",
  mode: "production",
  devtool: "inline-source-map",
  resolve: {
    extensions: [".ts", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              configFile: path.resolve(__dirname, "tsconfig.webpack.json")
            }
          }
        ]
      }
    ]
  }
};
