import {
	GitBranch,
	Search,
	MessageCircle,
	BarChart3,
	Zap,
	Shield,
	Bot,
	Github,
} from "lucide-react";
import { RepoInput } from "@/components/ui/custom/RepoInput";

export function Home() {
	return (
		<>
			<div className="relative z-10 flex flex-col items-center justify-center h-screen px-4 py-4 md:py-6 lg:py-8 overflow-y-auto">
				{/* Hero Section */}
				<div className="text-center mb-6 md:mb-8 lg:mb-12 max-w-4xl">
					<div className="mb-3 md:mb-4">
						<div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20 mb-3 md:mb-4">
							<GitBranch className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
							<span className="text-xs md:text-sm text-white/80">
								AI-Powered Git Repository Analysis
							</span>
						</div>
					</div>

					<h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent mb-3 md:mb-4 leading-tight">
						GitOdyssey
					</h1>

					<p className="text-base md:text-lg lg:text-xl text-white/70 mb-6 md:mb-8 max-w-3xl mx-auto leading-relaxed px-4">
						Explore your Git repositories with AI-powered insights. Understand
						commits, analyze changes, and discover patterns.
					</p>

					<div className="max-w-xl md:max-w-2xl mx-auto px-4">
						<RepoInput />
					</div>
				</div>

				{/* Features Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-6xl w-full px-4">
					<div className="group bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 md:p-6 hover:bg-white/10 transition-all duration-300 hover:scale-105">
						<div className="w-8 h-8 md:w-10 md:h-10 bg-blue-500/20 rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:bg-blue-500/30 transition-colors">
							<Search className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
						</div>
						<h3 className="text-base md:text-lg font-semibold text-white mb-2 md:mb-3">
							Smart Search
						</h3>
						<p className="text-xs md:text-sm text-white/60 leading-relaxed">
							Find commits, branches, and files with natural language queries.
							Ask questions about your codebase and get instant, relevant
							results.
						</p>
					</div>

					<div className="group bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 md:p-6 hover:bg-white/10 transition-all duration-300 hover:scale-105">
						<div className="w-8 h-8 md:w-10 md:h-10 bg-purple-500/20 rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:bg-purple-500/30 transition-colors">
							<MessageCircle className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
						</div>
						<h3 className="text-base md:text-lg font-semibold text-white mb-2 md:mb-3">
							AI Assistant
						</h3>
						<p className="text-xs md:text-sm text-white/60 leading-relaxed">
							Chat with an AI that understands your repository. Get
							explanations, suggestions, and insights about your code changes
							and development patterns.
						</p>
					</div>

					<div className="group bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 md:p-6 hover:bg-white/10 transition-all duration-300 hover:scale-105 md:col-span-2 lg:col-span-1">
						<div className="w-8 h-8 md:w-10 md:h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:bg-emerald-500/30 transition-colors">
							<BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
						</div>
						<h3 className="text-base md:text-lg font-semibold text-white mb-2 md:mb-3">
							Visual Analytics
						</h3>
						<p className="text-xs md:text-sm text-white/60 leading-relaxed">
							Visualize your repository's evolution with interactive graphs and
							charts. Understand commit patterns, branch relationships, and code
							growth.
						</p>
					</div>
				</div>

				{/* Bottom Features */}
				<div className="mt-6 md:mt-8 flex flex-wrap justify-center gap-4 md:gap-6 text-white/50 px-4">
					<div className="flex items-center gap-2">
						<Zap className="w-3 h-3 md:w-4 md:h-4 text-yellow-400" />
						<span className="text-xs md:text-sm">Lightning Fast</span>
					</div>
					<div className="flex items-center gap-2">
						<Shield className="w-3 h-3 md:w-4 md:h-4 text-green-400" />
						<span className="text-xs md:text-sm">Secure & Private</span>
					</div>
					<div className="flex items-center gap-2">
						<Bot className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
						<span className="text-xs md:text-sm">AI powered</span>
					</div>
				</div>

				{/* Footer */}
				<footer className="mt-8 md:mt-12 pt-6 md:pt-8 border-t border-white/10">
					<div className="text-center">
						<p className="text-sm text-white/50 mb-3">
							Created by <span className="text-white/70">Dylan Pina</span>,{" "}
							<span className="text-white/70">William Sullivan</span>, and{" "}
							<span className="text-white/70">Pranav Senthilvel</span>
						</p>
						<a
							href="https://github.com/DylanPina/git-odyssey"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
						>
							<Github className="w-4 h-4" />
							<span className="text-sm">View on GitHub</span>
						</a>
					</div>
				</footer>
			</div>
		</>
	);
}
