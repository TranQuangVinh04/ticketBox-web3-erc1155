// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @author TranQuangVinh04 - vinhtq04.dev@gmail.com
 * @title Một smart contract vé sự kiện sử dụng chuẩn ERC1155 để tạo cá ticket sự kiện âm nhạc , các show của các artist
 * @notice Hợp đồng này là smart contract vé sự kiện sử dụng chuẩn ERC1155
 * @notice Dùng để quản lý hệ thống vé (tạo, bán, kiểm soát số lượng)
 * @notice Được xây dựng cho đồ án Major 2 tại Đại học DNC bởi TranQuangVinh04
 * @notice Mục tiêu: hạn chế / ngăn chặn vấn nạn vé giả trong các sự kiện
 * @notice Địa chỉ creator: 0xC10960B83604Bf2F4A909049c6A0a827d581B717
 */

contract Ticket1155 is ERC1155, Ownable, Pausable {

    // Base URI dùng làm tiền tố cho mọi token
    string private _baseURI;

    // Mapping lưu URI riêng cho từng token ID (nếu cần)
    mapping(uint256 => string) private _tokenURIs;

    // Danh sách staff được phép burn vé thay cho người dùng
    mapping(address => bool) private _staff;

    // Struct lưu thông tin của từng loại vé
    struct TicketType {
        string name;           // tên loại vé
        uint256 maxSupply;     // số lượng tối đa của loại vé
        uint256 currentSupply; // số lượng đang lưu hành
        bool isActive;         // trạng thái của loại vé
        uint256 currentBurn;   // tổng số vé đã burn
    }

    // Mapping lưu thông tin loại vé cho từng tokenId
    mapping(uint256 => TicketType) public ticketTypes;

    // Giá vé cho từng loại (tokenId => price in wei)
    mapping(uint256 => uint256) public ticketPrices;

    constructor()
        ERC1155("")
        Ownable(msg.sender)
    {
        // set base URI - it will be used to create the URI for each token
        _baseURI = "https://plum-electrical-lizard-937.mypinata.cloud/ipfs/bafybeieag44hbhnrqd3xi43riu3w4mst744ulx257dvhbkghvkagzbxtnm/";
    }

    /**
     * @dev Ghi đè hàm uri() của ERC1155 để trả về URI ứng với từng token ID
     * @param tokenId ID của token
     * @return URI của token tương ứng
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        // Nếu token có URI riêng đã được set thì ưu tiên trả về URI đó
        string memory tokenURI = _tokenURIs[tokenId];
        if (bytes(tokenURI).length > 0) {
            return tokenURI;
        }

        // Nếu không có URI riêng: dùng baseURI + tokenId (ví dụ: baseURI/1, baseURI/2, ...)
        return string(abi.encodePacked(_baseURI, _toString(tokenId)));
    }

    /**
     * @dev Set base URI dùng chung cho tất cả token (nếu không có URI riêng)
     * @param newBaseURI Base URI mới
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseURI = newBaseURI;
    }

    /**
     * @dev Set URI riêng cho một token ID cụ thể (override base URI)
     * @param tokenId ID của token
     * @param tokenURI URI riêng cho token đó
     */
    function setTokenURI(uint256 tokenId, string memory tokenURI) external onlyOwner {
        _tokenURIs[tokenId] = tokenURI;
    }

    /**
     * @dev Xóa URI riêng của một token (sẽ dùng lại base URI)
     * @param tokenId ID của token
     */
    function clearTokenURI(uint256 tokenId) external onlyOwner {
        delete _tokenURIs[tokenId];
    }

    /**
     * @dev Set giá cho một loại vé (tokenId)
     * @param tokenId ID của loại vé
     * @param price Giá vé tính bằng wei (1 ETH = 1e18 wei)
     */
    function setTicketPrice(uint256 tokenId, uint256 price) external onlyOwner {
        ticketPrices[tokenId] = price;
    }

    /**
     * @dev Thêm / gỡ quyền staff (được burn vé thay cho người dùng)
     * @param account Địa chỉ staff
     * @param active true = là staff, false = hủy staff
     */
    function setStaff(address account, bool active) external onlyOwner {
        _staff[account] = active;
    }

    /**
     * @dev Kiểm tra một địa chỉ có phải staff không
     * @param account Địa chỉ cần kiểm tra
     * @return true nếu là staff, ngược lại false
     */
    function isStaff(address account) external view returns (bool) {
        return _staff[account];
    }

    /**
     * @dev Hàm helper để convert uint256 sang string (không đọc / ghi state)
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        temp = value;
        while (temp != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(temp % 10)));
            temp /= 10;
        }
        return string(buffer);
    }

    /**
     * @dev Set thông tin loại vé cho một token ID
     * @param tokenId ID của token
     * @param name Tên loại vé
     * @param maxSupply Số lượng tối đa có thể bán
     * @param isActive Trạng thái có đang bán không
     */
    function setTicketType(
        uint256 tokenId,
        string memory name,
        uint256 maxSupply,
        bool isActive
    ) external onlyOwner {
        ticketTypes[tokenId] = TicketType({
            name: name,
            maxSupply: maxSupply,
            currentSupply: ticketTypes[tokenId].currentSupply,
            isActive: isActive,
            currentBurn: ticketTypes[tokenId].currentBurn
        });
    }

    /**
     * @dev Lấy thông tin loại vé
     * @param tokenId ID của token
     * @return name Tên loại vé
     * @return maxSupply Số lượng tối đa
     * @return currentSupply Số lượng đang lưu hành
     * @return isActive Trạng thái
     * @return currentBurn Tổng số đã burn
     */
    function getTicketType(uint256 tokenId) external view returns (
        string memory name,
        uint256 maxSupply,
        uint256 currentSupply,
        bool isActive,
        uint256 currentBurn
    ) {
        TicketType memory ticket = ticketTypes[tokenId];
        return (
            ticket.name,
            ticket.maxSupply,
            ticket.currentSupply,
            ticket.isActive,
            ticket.currentBurn
        );
    }

    /**
     * @dev Kiểm tra xem có thể mint thêm không
     * @param tokenId ID của token
     * @param amount Số lượng muốn mint
     * @return true nếu có thể mint
     */
    function canMint(uint256 tokenId, uint256 amount) public view returns (bool) {
        TicketType memory ticket = ticketTypes[tokenId];

        // Nếu chưa set ticket type, cho phép mint (backward compatible)
        if (bytes(ticket.name).length == 0 && ticket.maxSupply == 0) {
            return true;
        }

        // Kiểm tra trạng thái
        if (!ticket.isActive) {
            return false;
        }

        // Kiểm tra số lượng
        return (ticket.currentSupply + amount) <= ticket.maxSupply;
    }

    /**
     * @dev Internal function để cập nhật currentSupply khi mint
     */
    function _updateSupplyOnMint(uint256 tokenId, uint256 amount) internal {
        ticketTypes[tokenId].currentSupply += amount;
    }

    /**
     * @dev Hàm nội bộ để cập nhật currentSupply khi burn
     * @param tokenId ID của loại vé
     * @param amount Số lượng vé bị burn
     */
    function _updateSupplyOnBurn(uint256 tokenId, uint256 amount) internal {
        require(amount >= 1 , "amount must be greater than or equal to 1");
        ticketTypes[tokenId].currentBurn += amount;
    }
    /**
     * @dev Tạo vé (mint) cho một địa chỉ:
     * - Cho phép: onlyOwner
     * - Cập nhật lại currentSupply tương ứng
     * @param id ID của loại vé
     * @param amount Số lượng vé muốn tạo
     */
    function createTicket(
        uint256 id,
        uint256 amount
    ) external onlyOwner {
        require(canMint(id, amount), "Ticket1155: Exceeds max supply or ticket not active");
        _mint(msg.sender, id, amount, "");
        _updateSupplyOnMint(id, amount);
    }

    /**
     * @dev Mua vé từ một địa chỉ:
     * - Cho phép: chính chủ, operator được approve, hoặc staff
     * - Cập nhật lại currentSupply tương ứng
     * @param id ID của loại vé
     */
    function buyTicket(uint256 id) external payable whenNotPaused {
        uint256 price = ticketPrices[id];
        if (price > 0) {
            require(msg.value == price, "Ticket1155: incorrect price");
        } else {
            require(msg.value == 0, "Ticket1155: incorrect price");
        }
        require(canMint(id, 1), "ticket is out of stock or stopped selling");
        
        if (ticketTypes[id].currentSupply > 0) {
            require(
                ticketTypes[id].currentSupply - ticketTypes[id].currentBurn >= 1,
                "ticket is out of stock or stopped selling"
            );
        }
        _mint(msg.sender, id, 1, "");
        _updateSupplyOnMint(id, 1);
    }

    /**
     * @dev Rút toàn bộ số ETH đang giữ trong contract về địa chỉ chỉ định
     * @param to Địa chỉ nhận tiền (phải khác địa chỉ 0)
     */
    function withdraw(address payable to) external onlyOwner {
        require(to != address(0), "Ticket1155: zero address");
        uint256 amount = address(this).balance;
        require(amount > 0, "Ticket1155: no funds");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Ticket1155: withdraw failed");
    }

    /**
     * @dev Burn vé từ một địa chỉ:
     * - Cho phép: chính chủ, operator được approve, hoặc staff
     * - Cập nhật lại currentSupply tương ứng
     */
    function burnTicket(
        address account,
        uint256 id,
        uint256 amount
    ) external {
        require(
            account == msg.sender ||
                isApprovedForAll(account, msg.sender) ||
                _staff[msg.sender],
            "Ticket1155: Not authorized to burn"
        );
        _burn(account, id, amount);
        _updateSupplyOnBurn(id, amount);
    }

    /**
     * @dev Tạm dừng bán vé
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Tiếp tục bán vé
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
