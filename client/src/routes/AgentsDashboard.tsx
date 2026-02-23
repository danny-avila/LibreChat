import React, { useState } from 'react';
import { useGetStartupConfig, useListAgentsQuery } from '~/data-provider';
import { processAgentOption } from '~/utils';
import { useOutletContext } from 'react-router-dom';
import type { ContextType } from '~/common';
import { Button, useMediaQuery } from '@librechat/client';
import { OpenSidebar } from '~/components/Chat/Menus';
import AgentModal from '~/components/Agents/AgentModal';
import { ChatContext } from '~/Providers';
import { useChatHelpers } from '~/hooks';

// Brand colors configuration
const BRAND_CONFIG = {
  primaryColor: 'from-blue-600 to-blue-700',
  accentColor: 'bg-blue-500',
  logoUrl: '/public/logo.png', // Update with your logo path
  brandName: 'LibreChat',
};

function getAvatarUrl(avatar?: { filepath?: string; source?: string }) {
  if (!avatar?.filepath) return undefined;
  return avatar.filepath;
}

export default function AgentsDashboard() {
  const { data: startupConfig } = useGetStartupConfig();
  const { data: agents = null, refetch } = useListAgentsQuery(undefined, {
    select: (res) =>
      res.data.map((agent) =>
        processAgentOption({
          agent: {
            ...agent,
            name: agent.name || agent.id,
          },
        }),
      ),
  });

  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isCreate, setIsCreate] = useState(false);
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();

  const chatHelpers = useChatHelpers();

  const handleOpenModal = (agent: any) => {
    setIsCreate(false);
    setSelectedAgent(agent);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedAgent(null);
  };

  const handleOpenCreateModal = () => {
    setIsCreate(true);
    setModalOpen(true);
  };

  const handleCreateSuccess = () => {
    refetch();
  };
  
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  // Mock data for stats when query is not available
  const agentsUsage = 42; // Mock value

  return (
    <ChatContext.Provider value={chatHelpers}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-full w-full rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-8 text-sm text-text-primary">
          
          {/* Header Section with Brand */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <OpenSidebar setNavVisible={setNavVisible} />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${BRAND_CONFIG.primaryColor} flex items-center justify-center text-white font-bold`}>
                  💬
                </div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-400 dark:to-blue-500 bg-clip-text text-transparent">
                  {BRAND_CONFIG.brandName} Agents
                </h1>
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-400 ml-11">
              Manage and interact with your available AI agents
            </p>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-3 gap-4 mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex flex-col items-center p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">📊</span>
                <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">{agentsUsage}</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Uses</span>
            </div>
            <div className="flex flex-col items-center p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">✅</span>
                <span className="text-3xl font-bold text-green-600 dark:text-green-400">0%</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Success Rate</span>
            </div>
            <div className="flex flex-col items-center p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🤖</span>
                <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {agents ? agents.length : 0}
                </span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Active Agents</span>
            </div>
          </div>

          {/* Create Agent Button */}
          <div className="flex gap-3 mb-8">
            <Button
              size="lg"
              className={`bg-gradient-to-r ${BRAND_CONFIG.primaryColor} text-white hover:shadow-lg transition-all duration-200`}
              onClick={handleOpenCreateModal}>
              <span className="text-xl mr-2">+</span>
              Create New Agent
            </Button>
          </div>

          {/* Agents Grid */}
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Available Agents
            </h2>
            
            {agents && agents.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="group cursor-pointer rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600"
                    onClick={() => handleOpenModal(agent)}
                  >
                    {/* Agent Avatar */}
                    <div className="mb-4 flex justify-center">
                      {agent.avatar?.filepath ? (
                        <img
                          src={getAvatarUrl(agent.avatar)}
                          alt={agent.name ?? `${agent.id}_avatar`}
                          className="h-20 w-20 rounded-full border-2 border-blue-200 dark:border-blue-700 object-cover shadow-sm group-hover:shadow-md transition-shadow"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-full border-2 border-blue-200 dark:border-blue-700 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center text-3xl shadow-sm">
                          🤖
                        </div>
                      )}
                    </div>

                    {/* Agent Info */}
                    <div className="text-center">
                      <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {agent.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                        {agent.description || 'No description available'}
                      </p>
                    </div>

                    {/* Interactive Indicator */}
                    <div className="mt-4 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Click to interact</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                <div className="text-5xl mb-4">🤖</div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
                  No agents available
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Create your first agent to get started
                </p>
                <Button
                  size="sm"
                  className={`bg-gradient-to-r ${BRAND_CONFIG.primaryColor} text-white`}
                  onClick={handleOpenCreateModal}>
                  Create First Agent
                </Button>
              </div>
            )}
          </div>

          {/* Agent Modal */}
          <AgentModal
            open={modalOpen}
            isCreate={isCreate}
            agent={selectedAgent}
            onClose={handleCloseModal}
            onSuccess={handleCreateSuccess}
          />
        </div>
      </div>
    </ChatContext.Provider>
  );
}
