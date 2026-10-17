// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface IWallet {
    function approve(uint256 id) external;
    function execute(uint256 id) external;
    function executeRecovery(uint256 id) external;
}
contract RevertingReceiver { receive() external payable { revert("reject"); } }
contract ReenteringReceiver {
    address public target;
    uint256 public id;
    uint8 public mode;
    bool public attempted;
    bool public succeeded;
    function configure(address t,uint256 i,uint8 m) external {target=t;id=i;mode=m;}
    receive() external payable {
        attempted=true;
        bytes memory data=mode==0?abi.encodeCall(IWallet.execute,(id)):mode==1?abi.encodeCall(IWallet.approve,(id)):abi.encodeCall(IWallet.executeRecovery,(id));
        (succeeded,)=target.call(data);
    }
}
