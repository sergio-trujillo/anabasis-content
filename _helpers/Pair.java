/**
 * Simple pair utility.
 * Used when you need to return or store two values together.
 */
public class Pair<A, B> {
    public final A first;
    public final B second;

    public Pair(A first, B second) {
        this.first = first;
        this.second = second;
    }

    @Override
    public String toString() {
        return "(" + first + ", " + second + ")";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Pair)) return false;
        Pair<?, ?> pair = (Pair<?, ?>) o;
        return java.util.Objects.equals(first, pair.first)
            && java.util.Objects.equals(second, pair.second);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(first, second);
    }
}
