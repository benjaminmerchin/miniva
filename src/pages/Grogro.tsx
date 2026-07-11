import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ShoppingCart } from "lucide-react";

export function Grogro() {
  const groceries = useQuery(api.groceries.getGroceries);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-8 h-8 text-primary" />
            Courses
          </h1>
          <p className="text-muted-foreground mt-1">
            Liste de courses gérée par l'agent Grogro.
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Utilisateur</th>
                <th className="px-6 py-4 font-medium">Article</th>
                <th className="px-6 py-4 font-medium">Quantité</th>
                <th className="px-6 py-4 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!groceries ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    Chargement...
                  </td>
                </tr>
              ) : groceries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    Aucun article dans la liste de courses.
                  </td>
                </tr>
              ) : (
                groceries.map((item) => (
                  <tr key={item._id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {item.discordUserId}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium">{item.item}</td>
                    <td className="px-6 py-4">
                      {item.quantity !== undefined ? item.quantity : "1"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.status === "bought"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }`}
                      >
                        {item.status === "bought" ? "Acheté" : "À acheter"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
