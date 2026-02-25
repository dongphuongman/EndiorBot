/**
 * Test Dashboard Page (No IPC Dependencies)
 */

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          📊 Dashboard
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Overview of your EndiorBot activity
        </p>
      </div>

      {/* Test Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">Active Session</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">Test Session</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">Token Usage</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">1,234 / 10,000</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">Daily Budget</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">$5.00 / $20.00</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">Monthly Budget</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">$45.00 / $100.00</p>
        </div>
      </div>

      {/* Test Content */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          ✅ Layout + Sidebar + Dashboard Working!
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          This is a test version of Dashboard without IPC dependencies.
          Next step: Enable preload script to use real IPC communication.
        </p>
      </div>
    </div>
  );
}
