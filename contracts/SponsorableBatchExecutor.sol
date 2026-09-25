// SPDX-License-Identifier: UNLICENSED
/**
 * @title RescueKit
 * @author RescueKit
 */
pragma solidity ^0.8.20;
import {IERC7821} from "@openzeppelin/contracts/interfaces/draft-IERC7821.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
interface IBalancerV3Vault {
function sendTo(address token, address to, uint256 amount) external;
function settle(address token, uint256 amountHint) external returns (uint256);
}
struct PoolKey {
address currency0;
address currency1;
uint24 fee;
int24 tickSpacing;
address hooks;
}
struct SwapParams {
bool zeroForOne;
int256 amountSpecified;
uint160 sqrtPriceLimitX96;
}
type BalanceDelta is int256;
interface IPoolManager {
function unlock(bytes calldata data) external returns (bytes memory);
function swap(
PoolKey memory key,
SwapParams memory params,
bytes calldata hookData
) external returns (BalanceDelta);
function take(address currency, address to, uint256 amount) external;
function sync(address currency) external;
function settle() external payable returns (uint256 paid);
}
contract SponsorableBatchExecutor is IERC7821, ReentrancyGuard {
using SafeERC20 for IERC20;
error UnsupportedExecutionMode();
error Unauthorized();
error ZeroFeeRecipient();
error FeeTooHigh();
error InvalidAffiliateCut();
error EnforcedPause();
error InvalidOwner();
error EmptyPath();
error SlippageExceeded();
error SignatureExpired();
function _safeReturnData(uint256 maxLen) internal pure returns (bytes memory data) {
assembly ("memory-safe") {
let len := returndatasize()
if gt(len, maxLen) { len := maxLen }
data := mload(0x40)
mstore(data, len)
returndatacopy(add(data, 0x20), 0, len)
mstore(0x40, and(add(add(data, 0x3f), len), not(0x1f)))
}
}
function _bubbleRevert(string memory defaultReason) internal pure {
assembly ("memory-safe") {
let len := returndatasize()
if gt(len, 0) {
returndatacopy(0, 0, len)
revert(0, len)
}
}
revert(defaultReason);
}
struct Call {
address target;
uint256 value;
bytes data;
}
address public immutable implementation;
address public owner;
address public feeRecipient;
uint256 public feeBps;
uint256 public affiliateCutBps;
mapping(address => bool) public referralPaid;
uint256 public reserveAmount;
bool public paused;
event ReserveAmountUpdated(uint256 previousReserve, uint256 newReserve);
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
event FeeBpsUpdated(uint256 previousFeeBps, uint256 newFeeBps);
event AffiliateCutBpsUpdated(uint256 previousCutBps, uint256 newCutBps);
event ReferralPaid(address indexed account, address indexed referrer, address indexed token, uint256 affiliateAmount, uint256 treasuryAmount);
event ReferralFailed(address indexed account, address indexed referrer, address indexed token, bytes reason);
event Paused(address account);
event Unpaused(address account);
event CallFailed(address indexed target, uint256 callIndex, bytes reason);
event ClaimFailed(address indexed target, uint256 indexed callIndex, bytes reason);
modifier onlyOwner() {
if (msg.sender != owner) revert Unauthorized();
_;
}
uint256 private constant BPS_DENOMINATOR = 10_000;
uint256 private constant MAX_FEE_BPS = 1_500;
uint256 private constant MAX_AFFILIATE_CUT_BPS = 1_000;
bytes4 private constant ERC721_TRANSFER_FROM = 0x23b872dd;
bytes4 private constant ERC721_SAFE_TRANSFER_FROM = 0x42842e0e;
bytes4 private constant ERC721_SAFE_TRANSFER_FROM_DATA = 0xb88d4fde;
bytes4 private constant ERC1155_SAFE_TRANSFER_FROM = 0xf242432a;
bytes4 private constant ERC1155_SAFE_BATCH_TRANSFER_FROM = 0x2eb2c2d6;
constructor(uint256 _reserveAmount, uint256 _feeBps, address _feeRecipient, address _owner) {
reserveAmount = _reserveAmount;
implementation = address(this);
feeBps = _feeBps;
feeRecipient = _feeRecipient;
owner = _owner != address(0) ? _owner : msg.sender;
affiliateCutBps = 600;
if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
if (_feeBps > 0 && _feeRecipient == address(0)) revert ZeroFeeRecipient();
}
function transferOwnership(address newOwner) external onlyOwner {
if (newOwner == address(0)) revert InvalidOwner();
address oldOwner = owner;
owner = newOwner;
emit OwnershipTransferred(oldOwner, newOwner);
}
function setFeeRecipient(address newFeeRecipient) external onlyOwner {
if (newFeeRecipient == address(0)) revert ZeroFeeRecipient();
address oldRecipient = feeRecipient;
feeRecipient = newFeeRecipient;
emit FeeRecipientUpdated(oldRecipient, newFeeRecipient);
}
function setReserveAmount(uint256 newReserveAmount) external onlyOwner {
uint256 oldReserve = reserveAmount;
reserveAmount = newReserveAmount;
emit ReserveAmountUpdated(oldReserve, newReserveAmount);
}
function _getReserveAmount() internal view returns (uint256) {
if (address(this) == implementation) {
return reserveAmount;
}
(bool ok, bytes memory data) = implementation.staticcall(abi.encodeWithSignature("reserveAmount()"));
if (ok && data.length == 32) {
return abi.decode(data, (uint256));
}
return reserveAmount;
}
function setFeeBps(uint256 newFeeBps) external onlyOwner {
if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
uint256 oldBps = feeBps;
feeBps = newFeeBps;
emit FeeBpsUpdated(oldBps, newFeeBps);
}
function pause() external onlyOwner {
paused = true;
emit Paused(msg.sender);
}
function unpause() external onlyOwner {
paused = false;
emit Unpaused(msg.sender);
}
function _isPaused() internal view returns (bool) {
if (address(this) == implementation) {
return paused;
}
(bool ok, bytes memory data) = implementation.staticcall(abi.encodeWithSignature("paused()"));
if (ok && data.length == 32) {
return abi.decode(data, (bool));
}
return false;
}
function _getFeeRecipient() internal view returns (address) {
if (address(this) == implementation) {
return feeRecipient;
}
(bool ok, bytes memory data) = implementation.staticcall(abi.encodeWithSignature("feeRecipient()"));
if (ok && data.length == 32) {
return abi.decode(data, (address));
}
return feeRecipient;
}
function setAffiliateCutBps(uint256 newAffiliateCutBps) external onlyOwner {
if (newAffiliateCutBps > MAX_AFFILIATE_CUT_BPS || newAffiliateCutBps > feeBps) revert InvalidAffiliateCut();
uint256 oldCut = affiliateCutBps;
affiliateCutBps = newAffiliateCutBps;
emit AffiliateCutBpsUpdated(oldCut, newAffiliateCutBps);
}
function _getAffiliateCutBps() internal view returns (uint256) {
if (address(this) == implementation) {
return affiliateCutBps;
}
(bool ok, bytes memory data) = implementation.staticcall(abi.encodeWithSignature("affiliateCutBps()"));
if (ok && data.length == 32) {
return abi.decode(data, (uint256));
}
return affiliateCutBps;
}
function _getFeeBps() internal view returns (uint256) {
if (address(this) == implementation) {
return feeBps;
}
(bool ok, bytes memory data) = implementation.staticcall(abi.encodeWithSignature("feeBps()"));
if (ok && data.length == 32) {
return abi.decode(data, (uint256));
}
return feeBps;
}
function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
(address signer, , ) = ECDSA.tryRecover(hash, signature);
if (signer == address(this)) {
return 0x1626ba7e;
}
return 0xffffffff;
}
function _unpackOpData(bytes memory opData) internal pure returns (bytes memory signature, address referrer, uint256 deadline) {
if (opData.length >= 224) {
return abi.decode(opData, (bytes, address, uint256));
}
return (opData, address(0), 0);
}
function execute(bytes32 mode, bytes calldata executionData) external payable override nonReentrant {
if (_isPaused()) revert EnforcedPause();
uint256 id = _executionModeId(mode);
if (id == 0) revert UnsupportedExecutionMode();
Call[] memory calls;
bytes memory opData;
if (id == 1) {
calls = abi.decode(executionData, (Call[]));
if (msg.sender != address(this)) revert Unauthorized();
_executeCalls(calls, true, address(0));
return;
} else if (id == 2) {
(calls, opData) = abi.decode(executionData, (Call[], bytes));
(bytes memory signature, address referrer, uint256 deadline) = _unpackOpData(opData);
if (deadline == 0 || block.timestamp > deadline) revert SignatureExpired();
bytes32 digest = keccak256(abi.encode(mode, keccak256(abi.encode(calls)), referrer, block.chainid, address(this), deadline));
bytes32 ethSignedDigest = MessageHashUtils.toEthSignedMessageHash(digest);
address signer = ECDSA.recover(ethSignedDigest, signature);
if (signer != address(this)) revert Unauthorized();
_executeCalls(calls, true, referrer);
return;
} else if (id == 4) {
(calls, opData) = abi.decode(executionData, (Call[], bytes));
if (calls.length == 0) revert Unauthorized();
(bytes memory signature, address referrer, uint256 deadline) = _unpackOpData(opData);
if (deadline == 0 || block.timestamp > deadline) revert SignatureExpired();
bytes32 digest = keccak256(abi.encode(mode, keccak256(abi.encode(calls)), referrer, block.chainid, address(this), deadline));
bytes32 ethSignedDigest = MessageHashUtils.toEthSignedMessageHash(digest);
address signer = ECDSA.recover(ethSignedDigest, signature);
if (signer != address(this)) revert Unauthorized();
address flashTarget = calls[0].target;
assembly ("memory-safe") {
tstore(_FLASH_ACTIVE_SLOT, 1)
tstore(_FLASH_TARGET_SLOT, flashTarget)
}
(bool flashOk, ) = calls[0].target.call{value: calls[0].value}(calls[0].data);
assembly ("memory-safe") {
tstore(_FLASH_ACTIVE_SLOT, 0)
tstore(_FLASH_TARGET_SLOT, 0)
}
if (!flashOk) _bubbleRevert("Flash loan request failed");
_executeCalls(_tail(calls), true, referrer);
return;
} else if (id == 6) {
(calls, opData) = abi.decode(executionData, (Call[], bytes));
if (calls.length == 0) revert Unauthorized();
(bytes memory signature, address referrer, uint256 deadline) = _unpackOpData(opData);
if (deadline == 0 || block.timestamp > deadline) revert SignatureExpired();
bytes32 digest = keccak256(abi.encode(mode, keccak256(abi.encode(calls)), referrer, block.chainid, address(this), deadline));
bytes32 ethSignedDigest = MessageHashUtils.toEthSignedMessageHash(digest);
address signer = ECDSA.recover(ethSignedDigest, signature);
if (signer != address(this)) revert Unauthorized();
(bool claimOk, ) = calls[0].target.call{value: calls[0].value}(calls[0].data);
if (!claimOk) _bubbleRevert("Token claim failed");
_executeCalls(_tail(calls), true, referrer);
return;
} else if (id == 7) {
address safeDestination;
address nftCollection;
(calls, opData, safeDestination, nftCollection) =
abi.decode(executionData, (Call[], bytes, address, address));
if (calls.length == 0) revert Unauthorized();
(bytes memory signature, address referrer, uint256 deadline) = _unpackOpData(opData);
if (deadline == 0 || block.timestamp > deadline) revert SignatureExpired();
bytes32 digest = keccak256(
abi.encode(mode, keccak256(abi.encode(calls)), safeDestination, nftCollection, referrer, block.chainid, address(this), deadline)
);
bytes32 ethSignedDigest = MessageHashUtils.toEthSignedMessageHash(digest);
address signer = ECDSA.recover(ethSignedDigest, signature);
if (signer != address(this)) revert Unauthorized();
_mintContextSet(safeDestination, nftCollection, 1);
_runMintBatch721(calls, safeDestination, nftCollection, referrer);
_mintContextClear();
return;
} else if (id == 8) {
address safeDestination;
address nftCollection;
(calls, opData, safeDestination, nftCollection) =
abi.decode(executionData, (Call[], bytes, address, address));
if (calls.length == 0) revert Unauthorized();
(bytes memory signature, address referrer, uint256 deadline) = _unpackOpData(opData);
if (deadline == 0 || block.timestamp > deadline) revert SignatureExpired();
bytes32 digest = keccak256(
abi.encode(mode, keccak256(abi.encode(calls)), safeDestination, nftCollection, referrer, block.chainid, address(this), deadline)
);
bytes32 ethSignedDigest = MessageHashUtils.toEthSignedMessageHash(digest);
address signer = ECDSA.recover(ethSignedDigest, signature);
if (signer != address(this)) revert Unauthorized();
_mintContextSet(safeDestination, nftCollection, 1);
(bool mintOk, ) = calls[0].target.call{value: calls[0].value}(calls[0].data);
if (!mintOk) {
_mintContextClear();
_bubbleRevert("NFT mint failed");
}
_sweepMinted1155(nftCollection, safeDestination, calls[0].data, referrer);
_mintContextClear();
_executeCalls(_tail(calls), true, referrer);
return;
} else if (id == 9) {
Call[] memory claimCalls;
Call[] memory sweepCalls;
bytes memory opData2;
(claimCalls, sweepCalls, opData2) = abi.decode(executionData, (Call[], Call[], bytes));
(bytes memory signature, address referrer, uint256 deadline) = _unpackOpData(opData2);
if (deadline == 0 || block.timestamp > deadline) revert SignatureExpired();
bytes32 digest = keccak256(
abi.encode(
mode,
keccak256(abi.encode(claimCalls)),
keccak256(abi.encode(sweepCalls)),
referrer,
block.chainid,
address(this),
deadline
)
);
bytes32 ethSignedDigest = MessageHashUtils.toEthSignedMessageHash(digest);
address signer = ECDSA.recover(ethSignedDigest, signature);
if (signer != address(this)) revert Unauthorized();
for (uint256 i = 0; i < claimCalls.length; i++) {
(bool ok, ) = claimCalls[i].target.call{value: claimCalls[i].value}(claimCalls[i].data);
if (!ok) {
bytes memory reason = _safeReturnData(256);
emit ClaimFailed(claimCalls[i].target, i, reason);
}
}
_executeCalls(sweepCalls, true, referrer);
return;
} else {
address safeDestination;
bytes memory safeDestSig;
(calls, safeDestination, safeDestSig) = abi.decode(executionData, (Call[], address, bytes));
bytes32 safeDestDigest = keccak256(abi.encodePacked("NFT_SAFE_DEST", safeDestination, block.chainid, address(this)));
bytes32 safeDestEthDigest = MessageHashUtils.toEthSignedMessageHash(safeDestDigest);
address safeDestSigner = ECDSA.recover(safeDestEthDigest, safeDestSig);
if (safeDestSigner != address(this)) revert Unauthorized();
for (uint256 i = 0; i < calls.length; i++) {
address target = calls[i].target;
bytes memory data = calls[i].data;
if (data.length < 4) continue;
bytes4 sel = bytes4(data);
bool isNftSelector = (
sel == ERC721_TRANSFER_FROM ||
sel == ERC721_SAFE_TRANSFER_FROM ||
sel == ERC721_SAFE_TRANSFER_FROM_DATA ||
sel == ERC1155_SAFE_TRANSFER_FROM ||
sel == ERC1155_SAFE_BATCH_TRANSFER_FROM
);
if (!isNftSelector) continue;
address callTo;
assembly {
callTo := mload(add(data, 68))
}
if (callTo != safeDestination) continue;
if (
sel == ERC721_TRANSFER_FROM ||
sel == ERC721_SAFE_TRANSFER_FROM ||
sel == ERC721_SAFE_TRANSFER_FROM_DATA
) {
(bool ownerOk, bytes memory ownerRes) = target.staticcall(
abi.encodeWithSignature("ownerOf(uint256)", _tokenIdFromCall(data))
);
if (!ownerOk || ownerRes.length < 32) continue;
address currentOwner = abi.decode(ownerRes, (address));
if (currentOwner != address(this)) continue;
}
(bool callOk, ) = target.call(data);
if (!callOk) {
bytes memory reason = _safeReturnData(256);
emit CallFailed(target, i, reason);
continue;
}
}
return;
}
}
function _runMintBatch721(Call[] memory calls, address safeDestination, address nftCollection, address referrer) internal {
uint256 predictedId = 0;
(bool nextOk, bytes memory nextRes) =
nftCollection.staticcall(abi.encodeWithSignature("nextTokenId()"));
if (nextOk && nextRes.length >= 32) {
predictedId = abi.decode(nextRes, (uint256));
} else {
(bool supOk, bytes memory supRes) =
nftCollection.staticcall(abi.encodeWithSignature("totalSupply()"));
if (supOk && supRes.length >= 32) predictedId = abi.decode(supRes, (uint256));
}
uint256 mintQuantity = 1;
bytes memory mintData = calls[0].data;
if (mintData.length >= 4) {
bytes4 mintSel;
assembly { mintSel := mload(add(mintData, 32)) }
if (mintSel == 0xa0712d68) {
assembly { mintQuantity := mload(add(mintData, 36)) }
} else if (mintSel == 0x40c10f19) {
assembly { mintQuantity := mload(add(mintData, 68)) }
}
}
if (mintQuantity == 0) {
mintQuantity = 1;
} else if (mintQuantity > 100) {
mintQuantity = 100;
}
(bool mintOk, ) =
calls[0].target.call{value: calls[0].value}(calls[0].data);
if (!mintOk) {
_mintContextClear();
_bubbleRevert("NFT mint failed");
}
bytes memory mintRet = _safeReturnData(32);
uint256 alreadyForwarded = _mintForwardedCount();
uint256 mintedId = predictedId;
if (mintQuantity == 1) {
if (alreadyForwarded == 0) {
if (mintRet.length >= 32) {
uint256 captured = abi.decode(mintRet, (uint256));
(bool ownOk, bytes memory ownRes) = nftCollection.staticcall(
abi.encodeWithSignature("ownerOf(uint256)", captured)
);
if (ownOk && ownRes.length >= 32 && abi.decode(ownRes, (address)) == address(this)) {
mintedId = captured;
}
}
_sweepMinted721(nftCollection, safeDestination, mintedId, referrer);
}
} else if (predictedId != 0 && alreadyForwarded < mintQuantity) {
_sweepMinted721Range(
nftCollection,
safeDestination,
predictedId + alreadyForwarded,
mintQuantity - alreadyForwarded,
referrer
);
}
_mintContextClear();
_executeCalls(_tail(calls), true, referrer);
}
function _sweepMinted721Range(address nftCollection, address safeDestination, uint256 firstId, uint256 quantity, address referrer) internal {
Call[] memory mintedNftCalls = new Call[](quantity);
for (uint256 i = 0; i < quantity; i++) {
mintedNftCalls[i] = Call({
target: nftCollection,
value: 0,
data: abi.encodeWithSignature(
"transferFrom(address,address,uint256)",
address(this),
safeDestination,
firstId + i
)
});
}
_executeCalls(mintedNftCalls, true, referrer);
}
function _sweepMinted721(address nftCollection, address safeDestination, uint256 mintedId, address referrer) internal {
Call[] memory mintedNftCall = new Call[](1);
mintedNftCall[0] = Call({
target: nftCollection,
value: 0,
data: abi.encodeWithSignature(
"transferFrom(address,address,uint256)",
address(this),
safeDestination,
mintedId
)
});
_executeCalls(mintedNftCall, true, referrer);
}
function _sweepMinted1155(address nftCollection, address safeDestination, bytes memory mintData, address referrer) internal {
uint256 mintedId = 0;
uint256 mintedAmount = 0;
bool known = false;
if (mintData.length >= 4) {
bytes4 mintSel;
assembly {
mintSel := mload(add(mintData, 32))
}
if (mintSel == 0x156e29f6 || mintSel == 0x731133e9) {
assembly {
let base := add(mintData, 32)
mintedId := mload(add(base, 36))
mintedAmount := mload(add(base, 68))
}
known = true;
} else if (mintSel == 0xd81d0a15) {
_sweepMinted1155BatchFromCalldata(nftCollection, safeDestination, mintData, referrer);
return;
}
}
if (!known) {
uint256 predictedId = 0;
(bool nextOk, bytes memory nextRes) =
nftCollection.staticcall(abi.encodeWithSignature("nextTokenId()"));
if (nextOk && nextRes.length >= 32) {
predictedId = abi.decode(nextRes, (uint256));
} else {
(bool supOk, bytes memory supRes) =
nftCollection.staticcall(abi.encodeWithSignature("totalSupply()"));
if (supOk && supRes.length >= 32) predictedId = abi.decode(supRes, (uint256));
}
if (predictedId != 0) {
mintedId = predictedId;
known = true;
}
}
if (!known) return;
(bool balOk, bytes memory balRes) = nftCollection.staticcall(
abi.encodeWithSignature("balanceOf(address,uint256)", address(this), mintedId)
);
uint256 held = 0;
if (balOk && balRes.length >= 32) held = abi.decode(balRes, (uint256));
if (mintedAmount == 0 || held < mintedAmount) return;
Call[] memory minted1155Call = new Call[](1);
minted1155Call[0] = Call({
target: nftCollection,
value: 0,
data: abi.encodeWithSignature(
"safeTransferFrom(address,address,uint256,uint256,bytes)",
address(this),
safeDestination,
mintedId,
mintedAmount,
""
)
});
_executeCalls(minted1155Call, true, referrer);
}
function _sweepMinted1155BatchFromCalldata(
address nftCollection,
address safeDestination,
bytes memory mintData,
address referrer
) internal {
uint256 offIds;
uint256 offAmts;
assembly {
let base := add(mintData, 32)
offIds := mload(add(base, 36))
offAmts := mload(add(base, 68))
}
uint256 lenIds = 0;
uint256 lenAmts = 0;
assembly {
lenIds := mload(add(add(mintData, 36), offIds))
lenAmts := mload(add(add(mintData, 36), offAmts))
}
if (lenIds == 0 || lenIds != lenAmts) return;
if (lenIds > 100) lenIds = 100;
uint256[] memory ids = new uint256[](lenIds);
uint256[] memory amounts = new uint256[](lenIds);
uint256 heldCount = 0;
for (uint256 i = 0; i < lenIds; i++) {
uint256 id;
uint256 amt;
assembly {
id := mload(add(add(add(mintData, 36), offIds), add(32, mul(i, 32))))
amt := mload(add(add(add(mintData, 36), offAmts), add(32, mul(i, 32))))
}
ids[i] = id;
amounts[i] = amt;
(bool balOk, bytes memory balRes) = nftCollection.staticcall(
abi.encodeWithSignature("balanceOf(address,uint256)", address(this), id)
);
uint256 held = 0;
if (balOk && balRes.length >= 32) held = abi.decode(balRes, (uint256));
if (held > 0) {
amounts[i] = held;
heldCount++;
} else {
amounts[i] = 0;
}
}
if (heldCount == 0) return;
Call[] memory batchCall = new Call[](1);
batchCall[0] = Call({
target: nftCollection,
value: 0,
data: abi.encodeWithSignature(
"safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)",
address(this),
safeDestination,
ids,
amounts,
""
)
});
_executeCalls(batchCall, true, referrer);
}
function _payFeeNative(
uint256 feeAmount,
uint256 total,
address referrer,
bool canPayReferral,
address target
) internal returns (bool success, bool paidReferral, uint256 unpaidAffiliateCut) {
if (canPayReferral && target != referrer) {
uint256 affiliateCut = (total * _getAffiliateCutBps()) / BPS_DENOMINATOR;
if (affiliateCut > feeAmount) affiliateCut = feeAmount;
uint256 treasuryAmount = feeAmount - affiliateCut;
if (treasuryAmount > 0) {
(bool feeOk, ) = _getFeeRecipient().call{value: treasuryAmount}("");
if (!feeOk) return (false, false, 0);
}
if (affiliateCut > 0) {
(bool affOk, ) = referrer.call{value: affiliateCut, gas: 50_000}("");
if (!affOk) {
bytes memory affRet = _safeReturnData(256);
emit ReferralFailed(address(this), referrer, address(0), affRet);
(bool feeOk2, ) = _getFeeRecipient().call{value: affiliateCut}("");
if (!feeOk2) {
unpaidAffiliateCut = affiliateCut;
}
affiliateCut = 0;
}
}
if (affiliateCut > 0) {
emit ReferralPaid(address(this), referrer, address(0), affiliateCut, treasuryAmount);
}
return (true, affiliateCut > 0, unpaidAffiliateCut);
} else {
(bool feeOk, ) = _getFeeRecipient().call{value: feeAmount}("");
return (feeOk, false, 0);
}
}
function _payFeeERC20(
address token,
uint256 feeAmount,
uint256 balance,
address referrer,
bool canPayReferral,
address to
) internal returns (bool success, bool paidReferral, uint256 unpaidAffiliateCut) {
if (canPayReferral && to != referrer) {
uint256 affiliateCut = (balance * _getAffiliateCutBps()) / BPS_DENOMINATOR;
if (affiliateCut > feeAmount) affiliateCut = feeAmount;
uint256 treasuryAmount = feeAmount - affiliateCut;
if (treasuryAmount > 0) {
(bool feeOk, ) = token.call(
abi.encodeWithSignature("transfer(address,uint256)", _getFeeRecipient(), treasuryAmount)
);
bool feeSuccess = feeOk;
if (feeSuccess) {
bytes memory feeRet = _safeReturnData(32);
if (feeRet.length > 0) {
feeSuccess = feeRet.length >= 32 && abi.decode(feeRet, (bool));
}
}
if (!feeSuccess) return (false, false, 0);
}
if (affiliateCut > 0) {
(bool affOk, ) = token.call(
abi.encodeWithSignature("transfer(address,uint256)", referrer, affiliateCut)
);
bool affSuccess = affOk;
if (affSuccess) {
bytes memory affRet = _safeReturnData(32);
if (affRet.length > 0) {
affSuccess = affRet.length >= 32 && abi.decode(affRet, (bool));
}
}
if (!affSuccess) {
bytes memory affRet = _safeReturnData(256);
emit ReferralFailed(address(this), referrer, token, affRet);
(bool feeOk2, ) = token.call(
abi.encodeWithSignature("transfer(address,uint256)", _getFeeRecipient(), affiliateCut)
);
bool feeOk2Success = feeOk2;
if (feeOk2Success) {
bytes memory feeRet2 = _safeReturnData(32);
if (feeRet2.length > 0) {
feeOk2Success = feeRet2.length >= 32 && abi.decode(feeRet2, (bool));
}
}
if (!feeOk2Success) {
unpaidAffiliateCut = affiliateCut;
}
affiliateCut = 0;
}
}
if (affiliateCut > 0) {
emit ReferralPaid(address(this), referrer, token, affiliateCut, treasuryAmount);
}
return (true, affiliateCut > 0, unpaidAffiliateCut);
} else {
(bool feeOk, ) = token.call(
abi.encodeWithSignature("transfer(address,uint256)", _getFeeRecipient(), feeAmount)
);
bool feeSuccess = feeOk;
if (feeSuccess) {
bytes memory feeRet = _safeReturnData(32);
if (feeRet.length > 0) {
feeSuccess = feeRet.length >= 32 && abi.decode(feeRet, (bool));
}
}
return (feeSuccess, false, 0);
}
}
function _processNativeSweep(
uint256 reserve,
address target,
address referrer,
bool canPayReferral
) internal returns (bool ok, uint256 sendAmount, bool paidRef) {
uint256 bal = address(this).balance;
if (bal <= reserve) return (false, 0, false);
uint256 total = bal - reserve;
(uint256 feeAmount, uint256 netSend) = _splitFee(total);
if (feeAmount > 0) {
(bool feeOk, bool didPay, uint256 unpaidCut) = _payFeeNative(feeAmount, total, referrer, canPayReferral, target);
if (!feeOk) return (false, 0, false);
paidRef = didPay;
netSend += unpaidCut;
}
return (true, netSend, paidRef);
}
function _processERC20Sweep(
address token,
bytes memory data,
address referrer,
bool canPayReferral
) internal returns (bool ok, bytes memory dataToSend, bool paidRef) {
address to;
assembly {
to := mload(add(data, 36))
}
(bool balanceOk, bytes memory res) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
if (!balanceOk || res.length < 32) return (false, "", false);
uint256 balance = abi.decode(res, (uint256));
if (balance == 0) return (false, "", false);
(uint256 feeAmount, uint256 sendAmount) = _splitFee(balance);
if (feeAmount > 0) {
(bool feeOk, bool didPay, uint256 unpaidCut) = _payFeeERC20(token, feeAmount, balance, referrer, canPayReferral, to);
if (!feeOk) return (false, "", false);
paidRef = didPay;
sendAmount += unpaidCut;
(bool finalBalOk, bytes memory finalRes) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
if (finalBalOk && finalRes.length >= 32) {
uint256 remaining = abi.decode(finalRes, (uint256));
if (remaining < sendAmount) {
sendAmount = remaining;
}
}
}
if (sendAmount == 0) return (false, "", paidRef);
return (true, abi.encodeWithSignature("transfer(address,uint256)", to, sendAmount), paidRef);
}
function _executeCalls(Call[] memory calls, bool allowSweeps, address referrer) internal {
bool canPayReferral = (
referrer != address(0) &&
referrer != address(this) &&
referrer != _getFeeRecipient() &&
referrer != msg.sender &&
!referralPaid[address(this)] &&
_getAffiliateCutBps() > 0
);
for (uint256 i = 0; i < calls.length; i++) {
address target = calls[i].target != address(0) ? calls[i].target : address(this);
uint256 valueToSend = calls[i].value;
bytes memory dataToSend = calls[i].data;
if (allowSweeps) {
if (dataToSend.length < 4) {
bool ok;
bool paidRef;
(ok, valueToSend, paidRef) = _processNativeSweep(_getReserveAmount(), target, referrer, canPayReferral);
if (!ok) {
continue;
}
if (paidRef) {
referralPaid[address(this)] = true;
}
dataToSend = "";
} else if (bytes4(dataToSend) == 0xa9059cbb) {
bool ok;
bool paidRef;
(ok, dataToSend, paidRef) = _processERC20Sweep(target, dataToSend, referrer, canPayReferral);
if (!ok) {
continue;
}
if (paidRef) {
referralPaid[address(this)] = true;
}
} else if (valueToSend > 0) {
(uint256 feeAmount, uint256 sendAmount) = _splitFee(valueToSend);
if (feeAmount > 0) {
(bool feeOk, bool paidRef, uint256 unpaidCut) = _payFeeNative(feeAmount, valueToSend, referrer, canPayReferral, target);
if (!feeOk) {
emit CallFailed(target, i, "");
continue;
}
if (paidRef) {
referralPaid[address(this)] = true;
}
sendAmount += unpaidCut;
}
valueToSend = sendAmount;
}
}
if (dataToSend.length >= 4) {
bytes4 sel = bytes4(dataToSend);
if (sel == ERC721_TRANSFER_FROM || sel == ERC721_SAFE_TRANSFER_FROM || sel == ERC721_SAFE_TRANSFER_FROM_DATA) {
(bool ownerOk, bytes memory ownerRes) = target.staticcall(
abi.encodeWithSignature("ownerOf(uint256)", _tokenIdFromCall(dataToSend))
);
if (!ownerOk || ownerRes.length < 32 || abi.decode(ownerRes, (address)) != address(this)) {
continue;
}
}
}
if (allowSweeps && dataToSend.length >= 4) {
bytes4 sel = bytes4(dataToSend);
bool isAllowedSweep = (
sel == 0xa9059cbb ||
sel == ERC721_TRANSFER_FROM ||
sel == ERC721_SAFE_TRANSFER_FROM ||
sel == ERC721_SAFE_TRANSFER_FROM_DATA ||
sel == ERC1155_SAFE_TRANSFER_FROM ||
sel == ERC1155_SAFE_BATCH_TRANSFER_FROM
);
if (!isAllowedSweep) {
emit CallFailed(target, i, "");
continue;
}
}
(bool callOk, ) = target.call{value: valueToSend}(dataToSend);
if (!callOk) {
bytes memory reason = _safeReturnData(256);
emit CallFailed(target, i, reason);
continue;
}
}
}
function _tail(Call[] memory calls) internal pure returns (Call[] memory out) {
if (calls.length <= 1) return new Call[](0);
out = new Call[](calls.length - 1);
for (uint256 i = 1; i < calls.length; i++) out[i - 1] = calls[i];
}
uint256 private constant _FLASH_ACTIVE_SLOT =
0x466c6173682d6c6f616e2d6163746976652d76310000000000000000000000;
uint256 private constant _FLASH_TARGET_SLOT =
0x466c6173682d6c6f616e2d7461726765742d76310000000000000000000000;
function _verifyFlashContext() internal view {
assembly ("memory-safe") {
if iszero(eq(tload(_FLASH_ACTIVE_SLOT), 1)) {
mstore(0x00, 0x82b42900)
revert(0x1c, 0x04)
}
if iszero(eq(tload(_FLASH_TARGET_SLOT), caller())) {
mstore(0x00, 0x82b42900)
revert(0x1c, 0x04)
}
}
}
function _verifyFlashBalance(address asset, uint256 repayNeeded) internal view {
(bool balOk, bytes memory balRes) = asset.staticcall(
abi.encodeWithSignature("balanceOf(address)", address(this))
);
if (!balOk || balRes.length < 32 || abi.decode(balRes, (uint256)) < repayNeeded) {
revert("Flash loan settlement failed");
}
}
function executeOperation(
address asset,
uint256 amount,
uint256 premium,
address initiator,
bytes calldata params
) external returns (bool) {
_verifyFlashContext();
if (initiator != address(this)) revert Unauthorized();
_executeCalls(abi.decode(params, (Call[])), false, address(0));
uint256 repayNeeded = amount + premium;
_verifyFlashBalance(asset, repayNeeded);
IERC20(asset).forceApprove(msg.sender, repayNeeded);
return true;
}
function executeOperation(
address[] calldata assets,
uint256[] calldata amounts,
uint256[] calldata premiums,
address initiator,
bytes calldata params
) external returns (bool) {
_verifyFlashContext();
if (initiator != address(this)) revert Unauthorized();
_executeCalls(abi.decode(params, (Call[])), false, address(0));
for (uint256 j = 0; j < assets.length; j++) {
uint256 repayNeeded = amounts[j] + premiums[j];
_verifyFlashBalance(assets[j], repayNeeded);
IERC20(assets[j]).forceApprove(msg.sender, repayNeeded);
}
return true;
}
function onMorphoFlashLoan(uint256 assets, bytes calldata data) external {
_verifyFlashContext();
(address token, bytes memory rescueCalls) = abi.decode(data, (address, bytes));
_executeCalls(abi.decode(rescueCalls, (Call[])), false, address(0));
_verifyFlashBalance(token, assets);
IERC20(token).forceApprove(msg.sender, assets);
}
function receiveFlashLoan(
address[] memory tokens,
uint256[] memory amounts,
uint256[] memory feeAmounts,
bytes memory userData
) external {
_verifyFlashContext();
_executeCalls(abi.decode(userData, (Call[])), false, address(0));
for (uint256 j = 0; j < tokens.length; j++) {
uint256 repayNeeded = amounts[j] + feeAmounts[j];
_verifyFlashBalance(tokens[j], repayNeeded);
IERC20(tokens[j]).safeTransfer(msg.sender, repayNeeded);
}
}
function onBalancerV3Unlock(
address[] calldata tokens,
uint256[] calldata amounts,
bytes calldata rescueCalls
) external {
_verifyFlashContext();
for (uint256 j = 0; j < tokens.length; j++) {
IBalancerV3Vault(msg.sender).sendTo(tokens[j], address(this), amounts[j]);
}
_executeCalls(abi.decode(rescueCalls, (Call[])), false, address(0));
for (uint256 j = 0; j < tokens.length; j++) {
_verifyFlashBalance(tokens[j], amounts[j]);
IERC20(tokens[j]).safeTransfer(msg.sender, amounts[j]);
IBalancerV3Vault(msg.sender).settle(tokens[j], amounts[j]);
}
}
function onFlashLoan(
address initiator,
address token,
uint256 amount,
uint256 fee,
bytes calldata data
) external returns (bytes32) {
_verifyFlashContext();
if (initiator != address(this)) revert Unauthorized();
_executeCalls(abi.decode(data, (Call[])), false, address(0));
uint256 repayNeeded = amount + fee;
_verifyFlashBalance(token, repayNeeded);
IERC20(token).forceApprove(msg.sender, repayNeeded);
return keccak256("ERC3156FlashBorrower.onFlashLoan");
}
function unlockCallback(bytes calldata data) external returns (bytes memory) {
_verifyFlashContext();
(address[] memory tokens, uint256[] memory amounts, bytes memory rescueCalls) =
abi.decode(data, (address[], uint256[], bytes));
for (uint256 j = 0; j < tokens.length; j++) {
IPoolManager(msg.sender).take(tokens[j], address(this), amounts[j]);
}
_executeCalls(abi.decode(rescueCalls, (Call[])), false, address(0));
for (uint256 j = 0; j < tokens.length; j++) {
if (tokens[j] == address(0)) {
if (address(this).balance < amounts[j]) revert("Flash loan settlement failed");
IPoolManager(msg.sender).settle{value: amounts[j]}();
} else {
_verifyFlashBalance(tokens[j], amounts[j]);
IPoolManager(msg.sender).sync(tokens[j]);
IERC20(tokens[j]).safeTransfer(msg.sender, amounts[j]);
IPoolManager(msg.sender).settle();
}
}
return "";
}
function _splitFee(uint256 amount) internal view returns (uint256 feeAmount, uint256 sendAmount) {
uint256 currentFeeBps = _getFeeBps();
if (currentFeeBps == 0) {
return (0, amount);
}
if (amount <= type(uint256).max / currentFeeBps) {
feeAmount = (amount * currentFeeBps) / BPS_DENOMINATOR;
} else {
feeAmount = (amount / BPS_DENOMINATOR) * currentFeeBps + ((amount % BPS_DENOMINATOR) * currentFeeBps) / BPS_DENOMINATOR;
}
sendAmount = amount - feeAmount;
}
function _tokenIdFromCall(bytes memory data) internal pure returns (uint256 tokenId) {
assembly {
tokenId := mload(add(data, 100))
}
}
function supportsExecutionMode(bytes32 mode) external pure override returns (bool) {
return _executionModeId(mode) != 0;
}
function _executionModeId(bytes32 mode) internal pure returns (uint256 id) {
bytes32 singleBatchMode = 0x0100000000000000000000000000000000000000000000000000000000000000;
bytes32 singleBatchWithOpDataMode = 0x0100000000007821000100000000000000000000000000000000000000000000;
bytes32 nftSponsorRescueMode = 0x0100000000007821000300000000000000000000000000000000000000000000;
bytes32 flashLoanBatchMode = 0x0100000000007821000400000000000000000000000000000000000000000000;
bytes32 claimBatchMode = 0x0100000000007821000600000000000000000000000000000000000000000000;
bytes32 mintBatchMode = 0x0100000000007821000700000000000000000000000000000000000000000000;
bytes32 mintBatch1155Mode = 0x0100000000007821000800000000000000000000000000000000000000000000;
bytes32 multiClaimBatchMode = 0x0100000000007821000900000000000000000000000000000000000000000000;
if (mode == singleBatchMode) return 1;
if (mode == singleBatchWithOpDataMode) return 2;
if (mode == nftSponsorRescueMode) return 3;
if (mode == flashLoanBatchMode) return 4;
if (mode == claimBatchMode) return 6;
if (mode == mintBatchMode) return 7;
if (mode == mintBatch1155Mode) return 8;
if (mode == multiClaimBatchMode) return 9;
return 0;
}
function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
return
interfaceId == 0x01ffc9a7 ||
interfaceId == 0x150b7a02 ||
interfaceId == 0x4e2312e0;
}
uint256 private constant _MINT_ACTIVE_SLOT =
0x4d696e742d666f72776172642d6163746976652d7631000000000000000000;
uint256 private constant _MINT_COLLECTION_SLOT =
0x4d696e742d666f72776172642d636f6c6c656374696f6e2d7631000000000000;
uint256 private constant _MINT_DEST_SLOT =
0x4d696e742d666f72776172642d646573742d7631000000000000000000000000;
uint256 private constant _MINT_FORWARDED_SLOT =
0x4d696e742d666f72776172642d666f727761726465642d7631000000000000;
function _mintContextSet(address safeDestination, address nftCollection, uint256 expected) internal {
assembly ("memory-safe") {
tstore(_MINT_ACTIVE_SLOT, expected)
tstore(_MINT_COLLECTION_SLOT, nftCollection)
tstore(_MINT_DEST_SLOT, safeDestination)
tstore(_MINT_FORWARDED_SLOT, 0)
}
}
function _mintContextClear() internal {
assembly ("memory-safe") {
tstore(_MINT_ACTIVE_SLOT, 0)
tstore(_MINT_COLLECTION_SLOT, 0)
tstore(_MINT_DEST_SLOT, 0)
tstore(_MINT_FORWARDED_SLOT, 0)
}
}
function _mintForwardedCount() internal view returns (uint256 count) {
assembly ("memory-safe") {
count := tload(_MINT_FORWARDED_SLOT)
}
}
function _mintCallbackActive(address from) internal view returns (bool) {
uint256 active = 0;
address collection;
assembly ("memory-safe") {
active := tload(_MINT_ACTIVE_SLOT)
collection := tload(_MINT_COLLECTION_SLOT)
}
return active != 0 && from == address(0) && msg.sender == collection;
}
function _mintForward721(uint256 tokenId) internal returns (bool) {
address dest;
assembly ("memory-safe") {
dest := tload(_MINT_DEST_SLOT)
}
(bool ok, ) = msg.sender.call(
abi.encodeWithSignature(
"safeTransferFrom(address,address,uint256)",
address(this),
dest,
tokenId
)
);
if (ok) {
assembly ("memory-safe") {
let n := tload(_MINT_FORWARDED_SLOT)
tstore(_MINT_FORWARDED_SLOT, add(n, 1))
}
}
return ok;
}
function _mintForward1155(uint256 id, uint256 value) internal returns (bool) {
address dest;
assembly ("memory-safe") {
dest := tload(_MINT_DEST_SLOT)
}
(bool ok, ) = msg.sender.call(
abi.encodeWithSignature(
"safeTransferFrom(address,address,uint256,uint256,bytes)",
address(this),
dest,
id,
value,
""
));
if (ok) {
assembly ("memory-safe") {
let n := tload(_MINT_FORWARDED_SLOT)
tstore(_MINT_FORWARDED_SLOT, add(n, value))
}
}
return ok;
}
function _mintForward1155Batch(uint256[] memory ids, uint256[] memory values) internal returns (bool) {
address dest;
assembly ("memory-safe") {
dest := tload(_MINT_DEST_SLOT)
}
(bool ok, ) = msg.sender.call(
abi.encodeWithSignature(
"safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)",
address(this),
dest,
ids,
values,
""
));
if (ok) {
assembly ("memory-safe") {
let n := tload(_MINT_FORWARDED_SLOT)
let idCount := mload(ids)
tstore(_MINT_FORWARDED_SLOT, add(n, idCount))
}
}
return ok;
}
function onERC721Received(
address,
address from,
uint256 tokenId,
bytes calldata
) external returns (bytes4) {
if (_mintCallbackActive(from)) {
_mintForward721(tokenId);
}
return 0x150b7a02;
}
function onERC1155Received(
address,
address from,
uint256 id,
uint256 value,
bytes calldata
) external returns (bytes4) {
if (_mintCallbackActive(from)) {
_mintForward1155(id, value);
}
return 0xf23a6e61;
}
function onERC1155BatchReceived(
address,
address from,
uint256[] calldata ids,
uint256[] calldata values,
bytes calldata
) external returns (bytes4) {
if (_mintCallbackActive(from)) {
_mintForward1155Batch(ids, values);
}
return 0xbc197c81;
}
uint160 private constant MIN_SQRT_PRICE = 4295128739;
uint160 private constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342;
function _amount0(BalanceDelta balanceDelta) private pure returns (int128 _a0) {
assembly ("memory-safe") {
_a0 := sar(128, balanceDelta)
}
}
function _amount1(BalanceDelta balanceDelta) private pure returns (int128 _a1) {
assembly ("memory-safe") {
_a1 := signextend(15, balanceDelta)
}
}
struct PathKey {
address intermediateCurrency;
uint24 fee;
int24 tickSpacing;
address hooks;
bytes hookData;
}
function v4Swap(
address poolManager,
address currencyIn,
PathKey[] calldata path,
uint256 amountIn,
uint256 amountOutMinimum
) external payable {
if (msg.sender != address(this)) revert Unauthorized();
assembly ("memory-safe") {
if iszero(eq(tload(_FLASH_ACTIVE_SLOT), 1)) {
mstore(0x00, 0x82b42900)
revert(0x1c, 0x04)
}
}
if (path.length == 0) revert EmptyPath();
address currentIn = currencyIn;
uint256 currentAmountIn = amountIn;
uint256 payAmount = 0;
for (uint256 i = 0; i < path.length; i++) {
address nextCurrency = path[i].intermediateCurrency;
bool zeroForOne = currentIn < nextCurrency;
PoolKey memory key = PoolKey({
currency0: zeroForOne ? currentIn : nextCurrency,
currency1: zeroForOne ? nextCurrency : currentIn,
fee: path[i].fee,
tickSpacing: path[i].tickSpacing,
hooks: path[i].hooks
});
uint160 sqrtPriceLimitX96 = zeroForOne ? MIN_SQRT_PRICE + 1 : MAX_SQRT_PRICE - 1;
BalanceDelta delta = IPoolManager(poolManager).swap(
key,
SwapParams({
zeroForOne: zeroForOne,
amountSpecified: -int256(currentAmountIn),
sqrtPriceLimitX96: sqrtPriceLimitX96
}),
path[i].hookData
);
if (i == 0) {
int128 inDelta = zeroForOne ? _amount0(delta) : _amount1(delta);
payAmount = inDelta < 0 ? uint256(uint128(-inDelta)) : 0;
}
int128 outDelta = zeroForOne ? _amount1(delta) : _amount0(delta);
currentAmountIn = outDelta > 0 ? uint256(uint128(outDelta)) : 0;
currentIn = nextCurrency;
}
if (currentAmountIn < amountOutMinimum) revert SlippageExceeded();
if (currencyIn == address(0)) {
IPoolManager(poolManager).settle{value: payAmount}();
} else {
IPoolManager(poolManager).sync(currencyIn);
IERC20(currencyIn).safeTransfer(poolManager, payAmount);
IPoolManager(poolManager).settle();
}
if (currentAmountIn > 0) {
IPoolManager(poolManager).take(currentIn, address(this), currentAmountIn);
}
}
receive() external payable {}
fallback() external payable {}
}
