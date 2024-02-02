import Convo from './Convo';
import Conversation from './Conversation';
import { useLocation } from 'react-router-dom';
import { TConversation } from 'librechat-data-provider';
import { parseISO, isToday, isWithinInterval, subDays, getYear } from 'date-fns';

const getGroupName = (date) => {
  const now = new Date();
  if (isToday(date)) {
    return 'Today';
  }
  if (isWithinInterval(date, { start: subDays(now, 7), end: now })) {
    return 'Last 7 days';
  }
  if (isWithinInterval(date, { start: subDays(now, 30), end: now })) {
    return 'Last 30 days';
  }
  return ' ' + getYear(date).toString(); // Returns the year for anything older than 30 days
};

// Function to group conversations
const groupConversationsByDate = (conversations) => {
  if (!Array.isArray(conversations)) {
    // Handle the case where conversations is not an array
    return {};
  }
  const groups = conversations.reduce((acc, conversation) => {
    const date = parseISO(conversation.updatedAt);
    const groupName = getGroupName(date);
    if (!acc[groupName]) {
      acc[groupName] = [];
    }
    acc[groupName].push(conversation);
    return acc;
  }, {});

  // Ensures groups are ordered correctly

  const sortedGroups = {};
  const dateGroups = ['Today', 'Last 7 days', 'Last 30 days'];
  dateGroups.forEach((group) => {
    if (groups[group]) {
      sortedGroups[group] = groups[group];
    }
  });

  Object.keys(groups)
    .filter((group) => !dateGroups.includes(group))
    .sort()
    .reverse()
    .forEach((year) => {
      sortedGroups[year] = groups[year];
    });

  return sortedGroups;
};

export default function Conversations({
  conversations,
  moveToTop,
  toggleNav,
}: {
  conversations: TConversation[];
  moveToTop: () => void;
  toggleNav: () => void;
}) {
  const location = useLocation();
  const { pathname } = location;
  const ConvoItem = pathname.includes('chat') ? Conversation : Convo;
  const groupedConversations = groupConversationsByDate(conversations);
  const firstTodayConvoId = conversations.find((convo) =>
    isToday(parseISO(convo.updatedAt)),
  )?.conversationId;

  return (
    <div className="flex-1 flex-col overflow-y-auto">
      {Object.entries(groupedConversations).map(([groupName, convos]) => (
        <div key={groupName}>
          <div
            style={{
              color: '#aaa', // Cor do texto
              fontSize: '0.7rem', // Tamanho da fonte
              marginTop: '20px', // Espaço acima do cabeçalho
              marginBottom: '5px', // Espaço abaixo do cabeçalho
              paddingLeft: '10px', // Espaçamento à esquerda para alinhamento com as conversas
            }}
          >
            {groupName}
          </div>
          {convos.map((convo, i) => (
            <ConvoItem
              key={convo.conversationId}
              isFirstTodayConvo={convo.conversationId === firstTodayConvoId}
              conversation={convo}
              retainView={moveToTop}
              toggleNav={toggleNav}
              i={i}
            />
          ))}
          <div
            style={{
              marginTop: '5px',
              marginBottom: '5px',
            }}
          ></div>
        </div>
      ))}
    </div>
  );
}
