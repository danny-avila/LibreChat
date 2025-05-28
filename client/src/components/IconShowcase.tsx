import React from 'react';
import {
  AIAssistantIcon,
  LoadingDotsIcon,
  ChatIcon,
  SendIcon,
  LikeIcon,
  DislikeIcon,
  UserIcon,
  GearIcon
} from '~/components/svg';

export default function IconShowcase() {
  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
          Новые Иконки AI Experts OS
        </h1>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          
          {/* AI Assistant Icon */}
          <div className="flex flex-col items-center p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <AIAssistantIcon size={48} className="mb-4 text-purple-600" />
            <h3 className="font-semibold text-sm text-center">AI Assistant</h3>
            <p className="text-xs text-gray-500 text-center mt-1">Основная иконка ИИ</p>
          </div>

          {/* Animated AI Assistant */}
          <div className="flex flex-col items-center p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <AIAssistantIcon size={48} className="mb-4 text-blue-600" animated={true} />
            <h3 className="font-semibold text-sm text-center">AI Animated</h3>
            <p className="text-xs text-gray-500 text-center mt-1">Анимированная версия</p>
          </div>

          {/* Loading Dots */}
          <div className="flex flex-col items-center p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <LoadingDotsIcon size={48} className="mb-4" />
            <h3 className="font-semibold text-sm text-center">Loading Dots</h3>
            <p className="text-xs text-gray-500 text-center mt-1">Анимация загрузки</p>
          </div>

          {/* Chat Icon */}
          <div className="flex flex-col items-center p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <ChatIcon />
            <h3 className="font-semibold text-sm text-center mt-4">Chat</h3>
            <p className="text-xs text-gray-500 text-center mt-1">Иконка чата</p>
          </div>

          {/* Send Icon */}
          <div className="flex flex-col items-center p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <div className="bg-blue-600 rounded-full p-3 mb-4">
              <SendIcon size={24} />
            </div>
            <h3 className="font-semibold text-sm text-center">Send</h3>
            <p className="text-xs text-gray-500 text-center mt-1">Отправка сообщения</p>
          </div>

          {/* Like Icon */}
          <div className="flex flex-col items-center p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <LikeIcon />
            <h3 className="font-semibold text-sm text-center mt-4">Like</h3>
            <p className="text-xs text-gray-500 text-center mt-1">Лайк с градиентом</p>
          </div>

          {/* Dislike Icon */}
          <div className="flex flex-col items-center p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <DislikeIcon />
            <h3 className="font-semibold text-sm text-center mt-4">Dislike</h3>
            <p className="text-xs text-gray-500 text-center mt-1">Дизлайк</p>
          </div>

          {/* User Icon */}
          <div className="flex flex-col items-center p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <UserIcon />
            <h3 className="font-semibold text-sm text-center mt-4">User</h3>
            <p className="text-xs text-gray-500 text-center mt-1">Пользователь</p>
          </div>

          {/* Gear Icon */}
          <div className="flex flex-col items-center p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <GearIcon className="w-6 h-6 text-gray-600" />
            <h3 className="font-semibold text-sm text-center mt-4">Settings</h3>
            <p className="text-xs text-gray-500 text-center mt-1">Настройки</p>
          </div>

        </div>

        {/* Logo Section */}
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-bold mb-6">Логотипы</h2>
          <div className="flex justify-center gap-8 items-center">
            <div className="text-center">
              <img src="/assets/logo-new.svg" alt="Светлый логотип" className="w-16 h-16 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Светлая тема</p>
            </div>
            <div className="text-center bg-gray-900 p-4 rounded-lg">
              <img src="/assets/logo-dark.svg" alt="Темный логотип" className="w-16 h-16 mx-auto mb-2" />
              <p className="text-sm text-gray-300">Темная тема</p>
            </div>
          </div>
        </div>

        {/* Favicon Section */}
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-bold mb-6">Фавиконы</h2>
          <div className="flex justify-center gap-4 items-center">
            <div className="text-center">
              <img src="/assets/favicon-16x16-new.svg" alt="Фавикон 16x16" className="w-8 h-8 mx-auto mb-2" />
              <p className="text-xs text-gray-600">16x16</p>
            </div>
            <div className="text-center">
              <img src="/assets/favicon-32x32-new.svg" alt="Фавикон 32x32" className="w-8 h-8 mx-auto mb-2" />
              <p className="text-xs text-gray-600">32x32</p>
            </div>
            <div className="text-center">
              <img src="/assets/apple-touch-icon-180x180-new.svg" alt="Apple Touch Icon" className="w-12 h-12 mx-auto mb-2" />
              <p className="text-xs text-gray-600">Apple Touch</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
