/**
 * @desc Xây dựng cấu trúc cây comments (comments và replies).
 * @param {Array<Object>} list - Danh sách comments phẳng từ DB
 * @param {string | number | null} parentId - ID cha bắt đầu (null cho comment gốc)
 * @returns {Array<Object>} Cấu trúc comments dạng cây
 */
function buildCommentTree(list, parentId) {
    const tree = [];

    list.forEach(item => {
        // Chuyển đổi null/undefined thành 0 để so sánh dễ dàng hơn với comments gốc
        const currentParentId = item.parent_id || 0;
        const targetParentId = parentId || 0;

        if (currentParentId === targetParentId) {
            const replies = buildCommentTree(list, item.id);
            if (replies.length) {
                item.replies = replies;
            }
            tree.push(item);
        }
    });

    return tree;
}

module.exports = { buildCommentTree };
