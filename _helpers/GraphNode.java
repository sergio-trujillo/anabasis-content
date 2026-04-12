import java.util.*;

/**
 * Graph node with adjacency list.
 * Used across graph problems (BFS, DFS, topological sort).
 */
public class GraphNode {
    public int val;
    public List<GraphNode> neighbors;

    public GraphNode() {
        this.val = 0;
        this.neighbors = new ArrayList<>();
    }

    public GraphNode(int val) {
        this.val = val;
        this.neighbors = new ArrayList<>();
    }

    public GraphNode(int val, List<GraphNode> neighbors) {
        this.val = val;
        this.neighbors = neighbors;
    }

    @Override
    public String toString() {
        return "Node(" + val + ", neighbors=" + neighbors.size() + ")";
    }
}
