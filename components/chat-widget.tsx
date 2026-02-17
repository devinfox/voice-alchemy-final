'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, X, Send, ChevronLeft, Users, GraduationCap, UserCircle } from 'lucide-react'

interface User {
  id: string
  first_name: string | null
  last_name: string | null
  name: string | null
  avatar_url: string | null
  role?: string | null
}

interface Message {
  id: string
  content: string
  created_at: string
  read_at: string | null
  sender_id: string
  recipient_id: string
}

interface ChatWidgetProps {
  currentUserId: string
}

function getUserDisplayName(user: User): string {
  if (user.name) return user.name
  if (user.first_name || user.last_name) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim()
  }
  return 'Unknown'
}

function getUserInitials(user: User): string {
  const name = getUserDisplayName(user)
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function ChatWidget({ currentUserId }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [teachers, setTeachers] = useState<User[]>([])
  const [students, setStudents] = useState<User[]>([])
  const [isTeacher, setIsTeacher] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch contacts on mount
  useEffect(() => {
    fetchContacts()
  }, [])

  // Fetch unread count on mount
  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
  }, [])

  // Poll for new messages when chat is open with a user
  useEffect(() => {
    if (isOpen && selectedUser) {
      fetchMessages(selectedUser.id)
      const interval = setInterval(() => fetchMessages(selectedUser.id), 5000)
      return () => clearInterval(interval)
    }
  }, [isOpen, selectedUser])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchContacts = async () => {
    try {
      setContactsLoading(true)
      const response = await fetch('/api/chat/contacts')
      const data = await response.json()
      if (response.ok) {
        setTeachers(data.teachers || [])
        setStudents(data.students || [])
        setIsTeacher(data.isTeacher || false)
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error)
    } finally {
      setContactsLoading(false)
    }
  }

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch('/api/messages/unread')
      const data = await response.json()
      if (response.ok) {
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error)
    }
  }

  const fetchMessages = async (userId: string) => {
    try {
      const response = await fetch(`/api/messages?userId=${userId}`)
      const data = await response.json()
      if (response.ok) {
        setMessages(data.messages || [])
        // Refresh unread count after reading messages
        fetchUnreadCount()
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }

  const handleSelectUser = async (user: User) => {
    setSelectedUser(user)
    setLoading(true)
    await fetchMessages(user.id)
    setLoading(false)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedUser || sending) return

    setSending(true)
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedUser.id,
          content: newMessage.trim(),
        }),
      })

      if (response.ok) {
        setNewMessage('')
        await fetchMessages(selectedUser.id)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' })
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  const totalContacts = teachers.length + students.length

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-12 h-12 lg:bottom-6 lg:right-6 lg:w-14 lg:h-14 bg-gradient-to-br from-[#CEB466] to-[#9c8644] rounded-full shadow-lg flex items-center justify-center text-[#171229] hover:scale-110 active:scale-95 transition-all duration-300 z-50 fab-button"
        style={{
          boxShadow: '0 8px 24px rgba(206, 180, 102, 0.4), 0 0 0 0 rgba(206, 180, 102, 0.4)',
        }}
      >
        <MessageCircle className="w-5 h-5 lg:w-6 lg:h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 lg:w-6 lg:h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/50 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          className="fixed inset-0 lg:inset-auto lg:bottom-6 lg:right-6 lg:w-96 lg:h-[550px] bg-gradient-to-b from-[#1a1535] to-[#171229] lg:rounded-2xl shadow-2xl border-0 lg:border border-white/10 flex flex-col z-50 overflow-hidden animate-slide-up"
          style={{
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.02] backdrop-blur-sm">
            {selectedUser ? (
              <>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-400" />
                </button>
                <div className="flex items-center gap-3 flex-1 ml-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] text-sm font-bold">
                    {getUserInitials(selectedUser)}
                  </div>
                  <div>
                    <span className="font-medium text-white">{getUserDisplayName(selectedUser)}</span>
                    {selectedUser.role && (
                      <p className="text-xs text-gray-400 capitalize">{selectedUser.role}</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[#CEB466]" />
                <span className="font-medium text-white">Messages</span>
              </div>
            )}
            <button
              onClick={() => {
                setIsOpen(false)
                setSelectedUser(null)
              }}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Content */}
          {selectedUser ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                    No messages yet. Say hello!
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_id === currentUserId ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                          msg.sender_id === currentUserId
                            ? 'bg-[#CEB466] text-[#171229] rounded-br-md'
                            : 'bg-white/10 text-white rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p
                          className={`text-xs mt-1 ${
                            msg.sender_id === currentUserId ? 'text-[#171229]/70' : 'text-gray-400'
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#CEB466]"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || sending}
                    className="w-10 h-10 bg-[#CEB466] hover:bg-[#e0c97d] disabled:opacity-50 rounded-full flex items-center justify-center text-[#171229] transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* Contact List */
            <div className="flex-1 overflow-y-auto">
              {contactsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#CEB466]"></div>
                </div>
              ) : totalContacts === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Users className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-sm">No contacts available</p>
                </div>
              ) : (
                <>
                  {/* Teachers Section */}
                  {teachers.length > 0 && (
                    <div>
                      <div className="sticky top-0 bg-[#1f1839] px-4 py-2 flex items-center gap-2 border-b border-white/5">
                        <GraduationCap className="w-4 h-4 text-[#CEB466]" />
                        <span className="text-xs font-semibold text-[#CEB466] uppercase tracking-wider">
                          Teachers ({teachers.length})
                        </span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {teachers.map((contact) => (
                          <button
                            key={contact.id}
                            onClick={() => handleSelectUser(contact)}
                            className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#CEB466] to-[#9c8644] flex items-center justify-center text-[#171229] font-bold">
                              {getUserInitials(contact)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-white truncate">{getUserDisplayName(contact)}</p>
                              <p className="text-xs text-gray-400">Teacher</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Students Section (only visible to teachers) */}
                  {students.length > 0 && (
                    <div>
                      <div className="sticky top-0 bg-[#1f1839] px-4 py-2 flex items-center gap-2 border-b border-white/5">
                        <UserCircle className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                          Students ({students.length})
                        </span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {students.map((contact) => (
                          <button
                            key={contact.id}
                            onClick={() => handleSelectUser(contact)}
                            className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                              {getUserInitials(contact)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-white truncate">{getUserDisplayName(contact)}</p>
                              <p className="text-xs text-gray-400">Student</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
