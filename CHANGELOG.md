# Changelog

## [7.0.2](https://github.com/web3-storage/dagula/compare/v7.0.1...v7.0.2) (2023-08-02)


### Bug Fixes

* upgrade ipfs-unixfs-exporter ([0b7a9e9](https://github.com/web3-storage/dagula/commit/0b7a9e91a1ad91ca68c6f5fd2373ea3f204a5552))

## [7.0.1](https://github.com/web3-storage/dagula/compare/v7.0.0...v7.0.1) (2023-08-02)


### Bug Fixes

* do not yield blocks that cannot be decoded or hashed ([#27](https://github.com/web3-storage/dagula/issues/27)) ([4f67d28](https://github.com/web3-storage/dagula/commit/4f67d28f547406ac7c48104ed78589dd2bf4968f))

## [7.0.0](https://github.com/web3-storage/dagula/compare/v6.0.2...v7.0.0) (2023-05-18)


### ⚠ BREAKING CHANGES

* remove search option ([#23](https://github.com/web3-storage/dagula/issues/23))
* rename dagScope to carScope ([#21](https://github.com/web3-storage/dagula/issues/21))

### Features

* add ordering option to getPath ([#19](https://github.com/web3-storage/dagula/issues/19)) ([ad25001](https://github.com/web3-storage/dagula/commit/ad25001d37c7e917e58cfa30e3bce6402c8fcab5))
* support yamux muxer ([#11](https://github.com/web3-storage/dagula/issues/11)) ([24ef997](https://github.com/web3-storage/dagula/commit/24ef997a664937257b0a4f719c62a554a7bbc77e))


### Bug Fixes

* rename dagScope to carScope ([#21](https://github.com/web3-storage/dagula/issues/21)) ([497cc90](https://github.com/web3-storage/dagula/commit/497cc9031a0871254cfd078fcbc749b7a9a7c691))


### refactor

* remove search option ([#23](https://github.com/web3-storage/dagula/issues/23)) ([9ede86f](https://github.com/web3-storage/dagula/commit/9ede86f8e8ef231a7bde64078e02b47369653795))

## [6.0.2](https://github.com/web3-storage/dagula/compare/v6.0.1...v6.0.2) (2023-05-02)


### Bug Fixes

* getPath through dag-cbor and identity nodes ([#17](https://github.com/web3-storage/dagula/issues/17)) ([d33890a](https://github.com/web3-storage/dagula/commit/d33890a221f77ad803b73d7118061a1727257fe5))

## [6.0.1](https://github.com/web3-storage/dagula/compare/v6.0.0...v6.0.1) (2023-05-01)


### Other Changes

* fix ci publishing ([#15](https://github.com/web3-storage/dagula/issues/15)) ([5c5af53](https://github.com/web3-storage/dagula/commit/5c5af5337983107c2bb44f1c0c84311e4079e04c))

## [6.0.0](https://github.com/web3-storage/dagula/compare/v5.0.0...v6.0.0) (2023-05-01)


### ⚠ BREAKING CHANGES

* support for multiple hash types ([#9](https://github.com/web3-storage/dagula/issues/9))

### Features

* add walkUnixfsPath to emit nodes for each path segment ([#7](https://github.com/web3-storage/dagula/issues/7)) ([6c0eed1](https://github.com/web3-storage/dagula/commit/6c0eed1c2e0a2071e8d7f70496039cb042deff4c))
* getPath with carScope ([#8](https://github.com/web3-storage/dagula/issues/8)) ([a613b45](https://github.com/web3-storage/dagula/commit/a613b45f731cbbf6f8e175af47bdf45fa3a45e25))
* support for multiple hash types ([#9](https://github.com/web3-storage/dagula/issues/9)) ([c147fdb](https://github.com/web3-storage/dagula/commit/c147fdbd8cfaea385a242776edc0908ed7694584))


### Other Changes

* publish from ci ([#13](https://github.com/web3-storage/dagula/issues/13)) ([5df4116](https://github.com/web3-storage/dagula/commit/5df411669682c7a2978421fbcdaceecba9d3408a))
